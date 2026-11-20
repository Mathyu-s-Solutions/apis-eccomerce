import { randomInt } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { TtlCache } from '../../../common/cache/ttl-cache';
import { UpstreamError } from '../../../common/errors/upstream.error';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  isWeakPin,
  OLVA_DOCUMENT_TYPES,
  type OlvaDestinationsQueryDto,
  type OlvaShipmentDto,
} from '../dto/olva-shipment.dto';
import { OLVA_REGISTRO, OlvaRegistroClient } from './olva-registro.client';

const HOUR = 60 * 60 * 1000;
type Row = Record<string, any>;

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const norm = (v: unknown): string =>
  str(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ');

const MODALITY = { store: 'STORE', destination: 'DESTINATION', pagoefectivo: 'ONLINE' } as const;
type Payment = keyof typeof MODALITY;

/** Formas de pago de una sede en los nombres de la API (el pago online con tarjeta no está soportado). */
function paymentsOf(origin: Row): Payment[] {
  const out: Payment[] = [];
  for (const m of Array.isArray(origin.payment_modalities) ? origin.payment_modalities : []) {
    const code = str(m.code);
    if (code === 'STORE') out.push('store');
    if (code === 'DESTINATION') out.push('destination');
    if (code === 'ONLINE' && (m.payment_methods ?? []).some((pm: Row) => str(pm.code) === 'PAGOEFECTIVO')) out.push('pagoefectivo');
  }
  return out;
}

/** El cuerpo de Olva viene como `{ data: … }` o directo. */
function dataOf(body: any): any {
  return body && typeof body === 'object' && !Array.isArray(body) && 'data' in body ? body.data : body;
}

/** Clave de 4 dígitos que Olva acepta (sin repetidos, consecutivos ni patrones simples). */
export function generatePin(): string {
  for (;;) {
    const pin = String(randomInt(0, 10_000)).padStart(4, '0');
    if (!isWeakPin(pin)) return pin;
  }
}

export interface OlvaOrigin {
  id: string;
  name: string;
  address: string;
  ubigeo: string;
  department: string;
  province: string;
  district: string;
  payments: string[];
  insurance: boolean;
}

export interface OlvaShipment {
  /** N° de registro de Olva (pedido de preventa; sale en el rótulo). */
  orderNumber: string | null;
  /**
   * Tracking de Olva (en el rótulo, "3123602-26"): sirve tal cual para POST /v1/olva/track
   * y para vigilarlo con webhooks. Aparece en el rastreo de Olva cuando recibe el paquete.
   */
  tracking: { orderNumber: string; orderCode: string } | null;
  /** Id del registro en Olva: sirve para descargar el rótulo. */
  cartId: string;
  payment: Payment;
  total: number | null;
  currency: 'PEN';
  /** Clave para recoger en tienda (solo si el destino es una tienda). Entrégala solo al destinatario. */
  pin: string | null;
  /** Con payment "pagoefectivo": el código CIP y el enlace para pagarlo. */
  pagoEfectivo: { cip: string | null; url: string | null } | null;
  origin: { id: string; name: string };
  destination: { type: 'store' | 'home'; name: string; ubigeo: string };
  /** Ruta para descargar el rótulo en PDF (con tu API key). */
  label: string;
  raw?: unknown;
}

/** Sede de origen como la devuelve la API pública. */
export function viewOrigin(h: Row): OlvaOrigin {
  return {
    id: str(h.headquarter_id),
    name: str(h.headquarter_name ?? h.name),
    address: str(h.address),
    ubigeo: str(h.ubigeo_code),
    department: str(h.department),
    province: str(h.province),
    district: str(h.district),
    payments: paymentsOf(h),
    insurance: h.show_insurance_option === true,
  };
}

/** Destino (tienda o distrito a domicilio) como lo devuelve la API pública. */
export function viewDestination(d: Row, type: 'store' | 'home') {
  const place = { ubigeo: str(d.ubigeo_code), department: str(d.department), province: str(d.province), district: str(d.district) };
  if (type === 'home') return { type, ...place };
  return {
    type,
    officeId: str(d.office_id),
    name: str(d.office_name),
    address: str(d.office_address),
    ...place,
    latitude: num(d.latitude),
    longitude: num(d.longitude),
    schedule: d.schedule ?? null,
  };
}

/**
 * Envíos de Olva por el registro web de Olva (registrodeenvios.olvacourier.com),
 * en el flujo de invitado: no necesita cuenta del cliente. Se paga en la tienda
 * al dejar el paquete, paga el destinatario o se paga un código de PagoEfectivo.
 * El resultado es un pedido de preventa con su rótulo.
 */
@Injectable()
export class OlvaShipmentsService {
  private readonly logger = new Logger(OlvaShipmentsService.name);
  private readonly headquartersCache = new TtlCache<Row[]>(6 * HOUR);
  private readonly categoriesCache = new TtlCache<Row[]>(24 * HOUR);
  private readonly destinationsCache = new TtlCache<Row[]>(HOUR);

  constructor(
    private readonly client: OlvaRegistroClient,
    private readonly prisma: PrismaService,
  ) {}

  // ─── Catálogos ─────────────────────────────────────────────────────────────

  private headquarters(): Promise<Row[]> {
    return this.headquartersCache.get(
      'all',
      async () => {
        const body = await this.client.call('GET', '/v1/shipping-records/headquarters', undefined, 'shipping_headquarters_index', 'on-demand');
        const list = dataOf(body);
        return Array.isArray(list) ? list : [];
      },
      (l) => l.length > 0,
    );
  }

  async origins(): Promise<OlvaOrigin[]> {
    return (await this.headquarters()).map(viewOrigin);
  }

  async categories(): Promise<Array<{ id: number; name: string }>> {
    const list = await this.categoriesCache.get(
      'all',
      async () => {
        const body = await this.client.call('GET', '/v1/shipping-records/article-categories', undefined, 'shipping_article_categories_index', 'on-demand');
        const rows = dataOf(body);
        return Array.isArray(rows) ? rows : [];
      },
      (l) => l.length > 0,
    );
    return list.map((c) => ({ id: Number(c.id), name: str(c.name ?? c.description) }));
  }

  /** Tiendas o distritos a domicilio a los que se puede enviar desde una sede, según quién paga. */
  private destinationsFrom(origin: Row, type: 'store' | 'home', modality: string): Promise<Row[]> {
    const ubigeo = str(origin.ubigeo_code);
    return this.destinationsCache.get(
      `${ubigeo}:${type}:${modality}`,
      async () => {
        const qs = new URLSearchParams({ mode: type, ubigeo_code: ubigeo, modality });
        const body = await this.client.call('GET', `/v1/shipping-records/destinations?${qs}`, undefined, 'shipping_destinations_index', 'on-demand');
        const rows = dataOf(body);
        const list: Row[] = Array.isArray(rows) ? rows : [];
        // Como su front: con pago en destino no se recoge en agentes.
        return type === 'store' && modality === 'DESTINATION' ? list.filter((d) => d.is_agent === false) : list;
      },
      (l) => l.length > 0,
    );
  }

  async destinations(q: OlvaDestinationsQueryDto) {
    const origin = await this.origin(q.origin);
    const modality = MODALITY[q.payment];
    this.requirePayment(origin, q.payment);
    const text = norm(q.q);
    const list = (await this.destinationsFrom(origin, q.type, modality)).filter(
      (d) =>
        (!q.department || norm(d.department) === norm(q.department)) &&
        (!q.province || norm(d.province) === norm(q.province)) &&
        (!q.district || norm(d.district) === norm(q.district)) &&
        (!text || norm([d.office_name, d.office_address, d.department, d.province, d.district].join(' ')).includes(text)),
    );
    return list.slice(0, q.limit).map((d) => viewDestination(d, q.type));
  }

  private async origin(id: string): Promise<Row> {
    const origin = (await this.headquarters()).find((h) => str(h.headquarter_id) === id);
    if (!origin) throw new BadRequestException(`La sede ${id} no existe en Olva (usa el id de GET /v1/olva/shipments/origins).`);
    return origin;
  }

  private requirePayment(origin: Row, payment: Payment): void {
    const offered = paymentsOf(origin);
    if (!offered.includes(payment)) {
      throw new BadRequestException(`La sede ${str(origin.headquarter_name)} no acepta payment "${payment}" (acepta: ${offered.join(', ') || 'ninguna'}).`);
    }
  }

  // ─── Registro ──────────────────────────────────────────────────────────────

  /** Registra el envío en Olva: carrito → origen → quién paga → paquete → precio → clave → pago (tienda, destino o CIP). */
  async createShipment(userId: string, dto: OlvaShipmentDto): Promise<OlvaShipment> {
    const db = this.db();
    const origin = await this.origin(dto.origin);
    const modality = MODALITY[dto.payment];
    this.requirePayment(origin, dto.payment);
    if (dto.package.insurance && origin.show_insurance_option !== true) {
      throw new BadRequestException(`La sede ${str(origin.headquarter_name)} no ofrece seguro: manda package.insurance en false.`);
    }

    const target = dto.destination;
    const destinations = await this.destinationsFrom(origin, target.type, modality);
    const destination =
      target.type === 'store'
        ? destinations.find((d) => str(d.office_id) === target.officeId)
        : destinations.find((d) => str(d.ubigeo_code) === target.ubigeo);
    if (!destination) {
      throw new BadRequestException(
        target.type === 'store'
          ? `La tienda ${target.officeId} no recibe envíos desde ${str(origin.headquarter_name)} con payment "${dto.payment}" (GET /v1/olva/shipments/destinations).`
          : `Olva no entrega a domicilio en el ubigeo ${target.ubigeo} desde ${str(origin.headquarter_name)} (GET /v1/olva/shipments/destinations?type=home).`,
      );
    }
    const sizes = Array.isArray(destination.size_types_allowed) ? destination.size_types_allowed : [];
    if (sizes.length && !sizes.some((s: Row) => str(s.code) === 'custom' && s.enabled !== false)) {
      throw new BadRequestException('Ese destino solo acepta los tamaños estándar de Olva (aún no soportados por la API).');
    }
    const categories = await this.categories();
    if (categories.length && !categories.some((c) => c.id === dto.package.categoryId)) {
      throw new BadRequestException(`package.categoryId ${dto.package.categoryId} no es una categoría de Olva (GET /v1/olva/shipments/categories).`);
    }
    const pickup = target.type === 'store';
    const pin = pickup ? (dto.pin ?? generatePin()) : null;

    const sender = await this.senderPayload(dto.sender);
    const created = await this.client.call('POST', '/v1/cart', { shipment_modality: 'package', person: sender }, 'cart_store');
    const cartId = str(created?.session_id ?? dataOf(created)?.session_id ?? created?.uuid);
    if (!cartId) throw new UpstreamError(OLVA_REGISTRO, 'Olva no devolvió el id del registro.', { status: 502 });

    await this.client.call(
      'PUT',
      `/v1/cart/${cartId}/origin`,
      {
        headquarter_id: origin.headquarter_id,
        ubigeo_id: origin.ubigeo_id,
        headquarter_name: origin.headquarter_name,
        address: origin.address,
        ubigeo: origin.ubigeo_concatenated,
        name: origin.name,
        show_insurance_option: origin.show_insurance_option,
      },
      'cart_origin_update',
    );
    await this.client.call('PUT', `/v1/cart/${cartId}/who-pays`, { who_pays: modality }, 'cart_who_pays_update');

    const item = {
      who_receive: {
        document_type: OLVA_DOCUMENT_TYPES[dto.recipient.documentType],
        document_number: dto.recipient.document,
        first_names: dto.recipient.firstNames,
        last_name: dto.recipient.documentType === 'ruc' ? '' : (dto.recipient.lastName ?? ''),
        contact_name: dto.recipient.contactName,
        phone: dto.recipient.phone,
        // Olva solo acepta el correo del destinatario con pago en destino.
        email: dto.payment === 'destination' ? dto.recipient.email : undefined,
      },
      destination: target.type === 'store' ? this.storeDestination(destination) : await this.homeDestination(destination, target),
      service: { return_charge: false, delivery_type: pickup ? 'O' : 'D' },
      what_send: {
        shipment_type: 2,
        weight: dto.package.weightKg,
        fragile: dto.package.fragile,
        height: dto.package.heightCm,
        width: dto.package.widthCm,
        length: dto.package.lengthCm,
        article_id: dto.package.categoryId,
        declared_value: dto.package.declaredValue,
        size_id: '',
        custom_size: true,
        insurance_accepted: dto.package.insurance,
      },
    };
    await this.client.call('POST', `/v1/cart/${cartId}/item`, item, 'cart_item_store');
    const priced = await this.client.call('GET', `/v1/price/${cartId}`, undefined, 'price_show');
    if (pin) await this.client.call('PUT', `/v1/shipping-records/cart/${cartId}/pin`, { pin }, 'shipping_pin_update');
    const paid =
      dto.payment === 'pagoefectivo'
        ? await this.client.call('POST', `/v1/cart/${cartId}/payment/pagoefectivo`, { email: dto.sender.email }, 'payment_pagoefectivo')
        : await this.client.call('POST', `/v1/cart/${cartId}/payment/tienda`, {}, 'payment_tienda');

    // Desde aquí el envío ya existe en Olva: nada lanza, para que un reintento no lo duplique.
    await db.olvaShipment
      .create({ data: { cartId, userId } })
      .catch((err) => this.logger.error(`No se registró el envío de Olva ${cartId} de ${userId}: ${String(err)}`));
    let cart: Row | null = null;
    try {
      cart = dataOf(await this.client.call('GET', `/v1/cart/${cartId}`, undefined, 'cart_show'));
    } catch (err) {
      this.logger.warn(`No se pudo leer el registro de Olva ${cartId} tras pagarlo: ${String(err)}`);
    }
    const paidData = dataOf(paid) ?? {};
    const orderNumber =
      str(cart?.payment?.nroPedidoPreventa ?? cart?.presale_result?.nroPedidoPreventa ?? cart?.nroPedidoPreventa ?? paidData?.nro_pedido ?? paidData?.nroPedidoPreventa) || null;
    // "remitos": "3123602-26--" = tracking 3123602, emisión 26 (lo que imprime el rótulo).
    const remito = str(cart?.presale_result?.remitos ?? cart?.presale?.remitos ?? cart?.remito_list ?? paidData?.remitos).match(/(\d+)-(\d{2})/);
    if (orderNumber) {
      await db.olvaShipment.update({ where: { cartId }, data: { orderNumber } }).catch(() => undefined);
    }
    const pe: Row | null = dto.payment === 'pagoefectivo' ? (cart?.pagoefectivo_result ?? paidData?.pagoefectivo_result ?? paidData ?? null) : null;
    return {
      orderNumber,
      tracking: remito ? { orderNumber: remito[1], orderCode: remito[2] } : null,
      cartId,
      payment: dto.payment,
      total: num(cart?.pricing?.total ?? dataOf(priced)?.total_amount ?? dataOf(priced)?.pricing?.total),
      currency: 'PEN',
      pin,
      pagoEfectivo: pe ? { cip: str(pe.cip_code ?? pe.cip) || null, url: str(pe.cip_url ?? pe.url) || null } : null,
      origin: { id: str(origin.headquarter_id), name: str(origin.headquarter_name) },
      destination: {
        type: target.type,
        name: target.type === 'store' ? str(destination.office_name) : str(destination.district),
        ubigeo: str(destination.ubigeo_code),
      },
      label: `/v1/olva/shipments/${cartId}/label`,
      raw: { cart, payment: paid },
    };
  }

  /** Rótulo en PDF de un envío que este cliente creó con la API. */
  async label(userId: string, cartId: string): Promise<{ data: Buffer; filename: string }> {
    const own = await this.db().olvaShipment.findUnique({ where: { cartId } });
    if (own?.userId !== userId) throw new NotFoundException('No encontramos ese envío entre los que creaste con la API (cartId de POST /v1/olva/shipments).');
    const body = await this.client.call('GET', `/v1/shipping-records/cart/${cartId}/label`, undefined, 'shipping_label_show');
    const b = dataOf(body) ?? body;
    const base64 = str(b?.pdf_base64 ?? body?.pdf_base64);
    const data = Buffer.from(base64, 'base64');
    if (!base64 || data.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new UpstreamError(OLVA_REGISTRO, 'Olva no entregó el PDF del rótulo.', { status: 502 });
    }
    return { data, filename: str(b?.filename) || `rotulo-olva-${cartId}.pdf` };
  }

  // ─── Pasos ─────────────────────────────────────────────────────────────────

  /**
   * Remitente como lo arma su front: si Olva ya conoce el documento usa sus
   * datos internos (y su nombre registrado); si no, los que se mandan.
   */
  private async senderPayload(s: OlvaShipmentDto['sender']): Promise<Row> {
    const type = OLVA_DOCUMENT_TYPES[s.documentType];
    const found = await this.client.request('GET', `/v1/person/${type}/${encodeURIComponent(s.document)}?role=sender`, undefined, 'person_lookup', 'on-demand');
    const person: Row | null = found.status < 400 ? (dataOf(found.body) ?? null) : null;
    if (s.documentType === 'ruc') {
      if (!person) throw new BadRequestException(`Olva no encuentra el RUC ${s.document} del remitente.`);
      if (person.contributor_status && !/^activ/i.test(str(person.contributor_status))) {
        throw new BadRequestException(`El RUC ${s.document} del remitente no está activo en SUNAT (${str(person.contributor_status)}).`);
      }
    }
    const registeredLast = [person?.last_name_paternal, person?.last_name_maternal].map(str).filter(Boolean).join(' ');
    return {
      document_type: type,
      document_number: s.document,
      first_names: s.documentType === 'ruc' ? str(person?.full_name) || s.firstNames : str(person?.first_names) || s.firstNames,
      last_name: s.documentType === 'ruc' ? '' : registeredLast || (s.lastName ?? ''),
      phone: s.phone,
      email: s.email,
      employee_id: person?.employee_id,
      discount_shipments_count: person?.discount_shipments_count,
      rounding_factor: person?.rounding_factor,
      package_headquarter_code: person?.package_headquarter_code,
      tax_affectation_type_id: person?.tax_affectation_type,
      person_legal_area: person?.juridical_area_id,
    };
  }

  /** Tienda de destino: el registro de la lista sin `cargo_flag` ni `ubigeo`, como su front. */
  private storeDestination(d: Row): Row {
    const { cargo_flag: _cargo, ubigeo: _ubigeo, ...rest } = d;
    return { ...rest, delivery_type: 'O' };
  }

  /** Domicilio: se geocodifica con Olva (coordenadas y zona de reparto); si no ubica la dirección, va sin coordenadas. */
  private async homeDestination(d: Row, target: Extract<OlvaShipmentDto['destination'], { type: 'home' }>): Promise<Row> {
    const qs = new URLSearchParams({ address: target.address, ubigeo: target.ubigeo });
    const res = await this.client.request('GET', `/v1/geo/address?${qs}`, undefined, 'geo_address', 'on-demand');
    const geo: Row | null = res.status < 400 ? (dataOf(res.body) ?? null) : null;
    return {
      ubigeo_id: d.ubigeo_id,
      address: str(geo?.address) || target.address,
      reference: target.reference,
      longitude: geo?.coordinates?.longitude,
      latitude: geo?.coordinates?.latitude,
      geocodingConfidence: geo?.geocodingConfidence,
      address_card: target.address,
      delivery_type: 'D',
      polygon: geo?.polygon,
      dangerous: false,
      size_types_allowed: d.size_types_allowed,
    };
  }

  private db(): PrismaService {
    if (!this.prisma.enabled) throw new ServiceUnavailableException('Crear envíos de Olva necesita la base de datos (DATABASE_URL).');
    return this.prisma;
  }
}
