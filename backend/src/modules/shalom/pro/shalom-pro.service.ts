import { randomInt } from 'node:crypto';
import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, type ShalomProAccount } from '../../../../generated/prisma';
import type { ApiKeyRecord } from '../../../auth/api-key.store';
import { quotaScope } from '../../../auth/plan-quota';
import { TtlCache } from '../../../common/cache/ttl-cache';
import { SecretBox } from '../../../common/crypto/secret-box';
import { UpstreamError } from '../../../common/errors/upstream.error';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  DEFAULT_PRO_ACCOUNT,
  documentType,
  SHALOM_DECLARATIONS,
  type ShalomPackage,
  type ShalomProAccountDto,
  type ShalomShipmentDto,
  WEAK_SECURITY_CODES,
} from '../dto/shalom-pro.dto';
import { guideKey, ShalomGuideCache } from '../shalom-guide-cache';
import { CookieJar, failed, pick, type ProFile, SHALOM_PRO, ShalomProClient, ShalomProSessionExpired } from './shalom-pro.client';

const HOUR = 60 * 60 * 1000;

/** Remitente: el titular de la cuenta de Shalom Pro (persona o empresa). */
export interface ProSender {
  document: string;
  documentType: 'DNI' | 'CE' | 'RUC' | 'PS' | null;
  name: string;
  paternalSurname: string;
  maternalSurname: string;
  phone: string | null;
  email: string | null;
}

export interface ShalomProAccountView {
  /** Identificador de la cuenta ("default" = la de PUT /shalom/pro/account). */
  account: string;
  email: string;
  sender: ProSender | null;
  connectedAt: string;
  updatedAt: string;
}

/** Agencia tal como la lista Shalom Pro (`/envia_ya/terminals`). */
type Terminal = Record<string, any>;

export interface ShalomShipment {
  /** Cuenta de Shalom Pro con la que se creó. */
  account: string;
  /** Número de guía: con `orderCode` sirve para POST /track. */
  orderNumber: string;
  series: string | null;
  orderCode: string | null;
  /** Clave de 4 dígitos con la que se recoge el envío. Entrégala solo al destinatario. */
  securityCode: string;
  oseId: string;
  price: number | null;
  currency: 'PEN';
  service: 'ground' | 'air';
  package: ShalomPackage;
  quantity: number;
  payer: 'sender' | 'recipient';
  origin: { code: string; name: string };
  destination: { code: string; name: string };
  recipient: { document: string; alreadyRegistered: boolean };
  /** Rutas para descargar el rótulo y el ticket en PDF (con tu API key). */
  label: string;
  ticket: string;
  raw?: unknown;
}

const str = (v: unknown): string => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const flag = (v: unknown): boolean => Number(v) === 1;
/** Igual que su front: minúsculas, sin espacios ni tildes ("Caja Paquete XS" → "cajapaquetexs"). */
const norm = (v: unknown): string =>
  str(v).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '');
const terminalName = (t: Terminal): string => str(t.lugar_over ?? t.zona ?? t.ter_id).toUpperCase();

/** Títulos de producto de Shalom Pro (normalizados) para cada tamaño. */
const PRODUCT_TITLES: Record<ShalomPackage, string[]> = {
  envelope: ['sobre'],
  xxs: ['cajapaquetexxs', 'cajapaqueteriaxxs'],
  xs: ['cajapaquetexs', 'minipaqueteria'],
  s: ['cajapaquetes', 'paqueteria'],
  m: ['cajapaquetem', 'paquetemediano'],
  l: ['cajapaquetel', 'paquete'],
  custom: ['otramedida', 'cotizacion'],
};

/** Dónde viene el precio de cada tamaño en `/envia_ya/tariff/calculate` (otra medida: `price`). */
const TARIFF_KEYS: Record<Exclude<ShalomPackage, 'custom'>, string> = {
  envelope: 'sobre',
  xxs: 'cajapaquetexxs',
  xs: 'cajapaquetexs',
  s: 'cajapaquetes',
  m: 'cajapaquetem',
  l: 'cajapaquetel',
};

/** Clave aleatoria de 4 dígitos que Shalom acepta (sin repetidos ni consecutivos). */
export function generateSecurityCode(): string {
  for (;;) {
    const code = String(randomInt(0, 10_000)).padStart(4, '0');
    if (!WEAK_SECURITY_CODES.includes(code)) return code;
  }
}

/** El remitente sale del perfil de la cuenta (`/auth/me`): persona primero, como su front. */
export function senderOf(body: unknown): ProSender | null {
  const me = pick(body, (l) => !!(l.person || l.company));
  if (!me) return null;
  const email = str(me.person?.email || me.company?.email || me.email) || null;
  if (me.person) {
    const p = me.person;
    const document = str(p.document);
    return {
      document,
      documentType: documentType(document),
      name: str(p.name || p.full_name),
      paternalSurname: str(p.last_name ?? p.lastname),
      maternalSurname: str(p.sur_name ?? p.surname),
      phone: str(p.phone || me.phone) || null,
      email,
    };
  }
  const c = me.company;
  return {
    document: str(c.number_document),
    documentType: 'RUC',
    name: str(c.legal_name),
    paternalSurname: '',
    maternalSurname: '',
    phone: str(c.phone || me.phone) || null,
    email,
  };
}

/** Orígenes permitidos para un destino aéreo (`origenes_aereos`: arreglo, JSON o lista). */
function airOrigins(v: unknown): number[] | null {
  if (Array.isArray(v)) return v.map(Number);
  if (typeof v === 'string' && v.trim()) {
    try {
      const parsed: unknown = JSON.parse(v);
      if (Array.isArray(parsed)) return parsed.map(Number);
    } catch {
      /* lista separada por comas */
    }
    return v.split(/\D+/).filter(Boolean).map(Number);
  }
  return null;
}

/** Cuerpo de `/envia_ya/service_order/save`, igual al que arma el formulario "Envía ya" de Shalom Pro. */
export function buildServiceOrder(i: {
  dto: ShalomShipmentDto;
  origin: Terminal;
  destination: Terminal;
  product: Record<string, any>;
  price: number;
  sender: ProSender & { phone: string };
  recipientUuid: string;
  securityCode: string;
}): Record<string, unknown> {
  const { dto } = i;
  const custom = dto.package === 'custom';
  return {
    origen: i.origin.ter_id,
    // Shalom marca el destino aéreo con un 0 delante.
    destino: dto.air ? `0${i.destination.ter_id}` : i.destination.ter_id,
    tipo_pago: dto.payer === 'recipient' ? 'DESTINATARIO' : 'REMITENTE',
    tipo_producto: i.product.id,
    tipo_producto_json: { value: i.price, name: i.product.title, detalle: i.product.content ?? '' },
    cantidad: dto.quantity,
    peso: custom ? (dto.weightKg ?? '') : '',
    alto: custom ? (dto.heightCm ?? '') : '',
    largo: custom ? (dto.lengthCm ?? '') : '',
    ancho: custom ? (dto.widthCm ?? '') : '',
    costo: i.price,
    destinatario_uuid: i.recipientUuid,
    remitente_telefono: i.sender.phone,
    remitente_nombre: i.sender.name,
    remitente_apellido_paterno: i.sender.paternalSurname,
    remitente_apellido_materno: i.sender.maternalSurname,
    garantia: 0,
    garantia_costo: 0,
    garantia_monto: 0,
    contact_extra_uuid: null,
    contacto_doc: null,
    grrs: JSON.stringify((dto.referralGuides ?? []).map((g) => ({ guide: g.number, series: g.series }))),
    clave: i.securityCode,
    aereo: dto.air ? 1 : 0,
    servicio_cobranza: 0,
    servicio_cobranza_costo: 0,
    declaracion_jurada: dto.declaration ? SHALOM_DECLARATIONS[dto.declaration] : '',
  };
}

/**
 * Cuentas de Shalom Pro conectadas a la vez: una, o varias (una por negocio) con
 * los planes Plataforma y Empresarial de Shalom (frontend/src/lib/plans.ts).
 */
export const PRO_ACCOUNTS_LIMIT = { base: 1, plataforma: 20, empresarial: 100 } as const;

export function proAccountsLimit(key: ApiKeyRecord, now = new Date()): number {
  const scope = quotaScope(key, 'shalom', now);
  if (scope.kind !== 'plan') return PRO_ACCOUNTS_LIMIT.base;
  if (scope.plan === 'empresarial') return PRO_ACCOUNTS_LIMIT.empresarial;
  if (scope.plan === 'plataforma') return PRO_ACCOUNTS_LIMIT.plataforma;
  return PRO_ACCOUNTS_LIMIT.base;
}

const MULTI_ACCOUNT_HINT =
  `Varias cuentas (una por negocio, eligiendo con cuál crear cada guía) son de los planes Plataforma (hasta ${PRO_ACCOUNTS_LIMIT.plataforma}) y Empresarial; ` +
  'si no, crea otra cuenta en el panel para cada negocio.';

/** Ruta con la que se conecta (o reconecta) una cuenta. */
function connectPath(ref: string): string {
  return ref === DEFAULT_PRO_ACCOUNT ? 'PUT /v1/shalom/pro/account' : `PUT /v1/shalom/pro/accounts/${ref}`;
}

/** Sesiones en memoria: una por cuenta de cada cliente (el ref no lleva "/"). */
const sessionKey = (a: { userId: string; ref: string }): string => `${a.userId}/${a.ref}`;

function view(account: ShalomProAccount): ShalomProAccountView {
  return {
    account: account.ref,
    email: account.email,
    sender: (account.sender as unknown as ProSender | null) ?? null,
    connectedAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

/**
 * Guías de Shalom con la cuenta de Shalom Pro del cliente. La guía queda a su
 * nombre, como si la registrara en pro.shalom.pe: el remitente es el titular de
 * la cuenta y paga en la agencia (o paga el destinatario, si así se indica).
 *
 * La sesión se guarda cifrada y se reutiliza; si Shalom la cierra, se vuelve a
 * entrar con la contraseña guardada (un captcha por login).
 */
@Injectable()
export class ShalomProService {
  private readonly logger = new Logger(ShalomProService.name);
  // La sesión de cada cuenta, con la contraseña cifrada con la que se abrió: si la
  // cuenta se reconecta (en esta u otra instancia) cambia y no se usa la sesión vieja.
  private readonly sessions = new Map<string, { jar: CookieJar; stamp: string }>();
  private readonly logins = new Map<string, Promise<CookieJar>>();
  // Agencias de Shalom Pro: las mismas para todas las cuentas.
  private readonly terminalsCache = new TtlCache<Terminal[]>(6 * HOUR);
  // Productos (tamaños): por cuenta, por si a una empresa le muestran otros.
  private readonly productsCache = new TtlCache<Array<Record<string, any>>>(6 * HOUR);

  constructor(
    private readonly client: ShalomProClient,
    private readonly prisma: PrismaService,
    private readonly secrets: SecretBox,
    private readonly guides: ShalomGuideCache,
  ) {}

  private db(): PrismaService {
    if (!this.prisma.enabled) throw new ServiceUnavailableException('Crear guías de Shalom necesita la base de datos (DATABASE_URL).');
    if (!this.secrets.available) throw new ServiceUnavailableException('El servidor no tiene configurada la llave para guardar credenciales (SUNAT_SECRETS_KEY).');
    return this.prisma;
  }

  // ─── Cuenta ────────────────────────────────────────────────────────────────

  /**
   * Entra con la cuenta (comprueba la contraseña) y la guarda cifrada con su
   * identificador. Una cuenta nueva cuenta contra el límite del plan; reconectar
   * una que ya existe (otra contraseña u otro correo) siempre se puede.
   */
  async connect(userId: string, dto: ShalomProAccountDto, ref: string = DEFAULT_PRO_ACCOUNT, limit: number = PRO_ACCOUNTS_LIMIT.base): Promise<ShalomProAccountView> {
    const db = this.db();
    const where = { userId_ref: { userId, ref } };
    if (!(await db.shalomProAccount.findUnique({ where, select: { ref: true } }))) {
      const others = await db.shalomProAccount.findMany({ where: { userId }, select: { ref: true }, orderBy: { createdAt: 'asc' }, take: limit });
      if (others.length >= limit) {
        throw new ForbiddenException(
          limit > 1
            ? `Ya tienes ${limit} cuentas de Shalom Pro conectadas, el máximo de tu plan: desconecta alguna${limit < PRO_ACCOUNTS_LIMIT.empresarial ? ', pasa al plan Empresarial (hasta ' + PRO_ACCOUNTS_LIMIT.empresarial + ')' : ''} o escríbenos para ampliarlo.`
            : `Tu plan permite 1 cuenta de Shalom Pro conectada y ya tienes una (para cambiarla, reconéctala con ${connectPath(others[0].ref)}). ${MULTI_ACCOUNT_HINT}`,
        );
      }
    }
    const jar = await this.client.login(dto.email, dto.password);
    let sender: ProSender | null;
    try {
      sender = senderOf(await this.client.call(jar, 'GET', '/auth/me'));
    } catch (err) {
      if (err instanceof ShalomProSessionExpired) throw new UpstreamError(SHALOM_PRO, 'Shalom Pro aceptó el login pero no abrió la sesión. Entra una vez en pro.shalom.pe por si pide verificar el correo.', { status: 502 });
      throw err;
    }
    const data = {
      email: dto.email,
      password: this.secrets.seal(dto.password),
      session: this.seal(jar),
      sender: sender ? (sender as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    };
    const account = await db.shalomProAccount.upsert({ where, create: { userId, ref, ...data }, update: data });
    this.sessions.set(sessionKey(account), { jar, stamp: account.password });
    this.productsCache.delete(sessionKey(account));
    return view(account);
  }

  /** Las cuentas conectadas, de la primera a la última. */
  async accounts(userId: string): Promise<ShalomProAccountView[]> {
    const rows = await this.db().shalomProAccount.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
    return rows.map(view);
  }

  async account(userId: string, ref: string = DEFAULT_PRO_ACCOUNT): Promise<ShalomProAccountView> {
    return view(await this.find(userId, ref));
  }

  /** Borra la cuenta guardada y cierra la sesión en Shalom (sin esperar). */
  async disconnect(userId: string, ref: string = DEFAULT_PRO_ACCOUNT): Promise<void> {
    const account = await this.find(userId, ref);
    const key = sessionKey(account);
    const jar = this.cached(account) ?? this.restore(account);
    this.sessions.delete(key);
    this.productsCache.delete(key);
    await this.db().shalomProAccount.delete({ where: { userId_ref: { userId, ref } } });
    if (jar) void this.client.request(jar, 'POST', '/auth/logout').catch(() => undefined);
  }

  private async find(userId: string, ref: string): Promise<ShalomProAccount> {
    const account = await this.db().shalomProAccount.findUnique({ where: { userId_ref: { userId, ref } } });
    if (!account) {
      throw new NotFoundException(
        ref === DEFAULT_PRO_ACCOUNT
          ? 'Primero conecta tu cuenta de Shalom Pro: PUT /v1/shalom/pro/account con tu correo y contraseña de pro.shalom.pe.'
          : `No hay una cuenta de Shalom Pro conectada como "${ref}": conéctala con ${connectPath(ref)} (GET /v1/shalom/pro/accounts lista las tuyas).`,
      );
    }
    return account;
  }

  /** La cuenta con la que se crea una guía: la de `account` o, si hay una sola, esa. */
  private async choose(userId: string, ref: string | undefined, limit: number): Promise<ShalomProAccount> {
    const db = this.db();
    const count = await db.shalomProAccount.count({ where: { userId } });
    if (count > limit) {
      throw new ForbiddenException(
        `Tienes ${count} cuentas de Shalom Pro conectadas y tu plan permite ${limit}. ` +
          (limit > 1 ? 'Desconecta las que sobran' : `${MULTI_ACCOUNT_HINT} Renueva el plan o desconecta las que sobran`) +
          ' con DELETE /v1/shalom/pro/accounts/{account}.',
      );
    }
    if (ref) return this.find(userId, ref);
    if (count > 1) {
      const refs = await db.shalomProAccount.findMany({ where: { userId }, select: { ref: true }, orderBy: { createdAt: 'asc' }, take: 10 });
      throw new BadRequestException(
        `Tienes ${count} cuentas de Shalom Pro conectadas: indica con cuál crear la guía en \`account\` (${refs.map((r) => r.ref).join(', ')}${count > refs.length ? ', …' : ''}).`,
      );
    }
    const only = count === 1 ? await db.shalomProAccount.findFirst({ where: { userId } }) : null;
    return only ?? this.find(userId, DEFAULT_PRO_ACCOUNT);
  }

  // ─── Guías ─────────────────────────────────────────────────────────────────

  /** Registra la guía en Shalom Pro. Devuelve el número de guía, la clave y el ose_id. */
  async createShipment(userId: string, dto: ShalomShipmentDto, limit: number = PRO_ACCOUNTS_LIMIT.base): Promise<ShalomShipment> {
    const account = await this.choose(userId, dto.account, limit);
    const securityCode = dto.securityCode ?? generateSecurityCode();
    const { saved, origin, destination, recipient } = await this.withSession(account, async (jar) => {
      const { origin, destination } = this.route(await this.terminals(jar), dto);
      const product = this.product(await this.products(sessionKey(account), jar), dto.package);
      const price = await this.tariff(jar, origin, destination, dto);
      const sender = senderOf(await this.client.call(jar, 'GET', '/auth/me'));
      if (!sender?.document || !sender.name) {
        throw new UpstreamError(SHALOM_PRO, 'No se pudo leer el remitente de tu cuenta de Shalom Pro: completa tu perfil en pro.shalom.pe.', { status: 400 });
      }
      const senderPhone = dto.senderPhone ?? sender.phone;
      if (!senderPhone) throw new BadRequestException('Tu cuenta de Shalom Pro no tiene celular: mándalo en senderPhone.');
      if (dto.declaration && sender.documentType === 'RUC') {
        throw new BadRequestException('La declaración jurada solo es para persona natural, y tu cuenta de Shalom Pro es de empresa.');
      }
      const recipient = await this.recipient(jar, dto.recipient);
      const body = buildServiceOrder({ dto, origin, destination, product, price, sender: { ...sender, phone: senderPhone }, recipientUuid: recipient.uuid, securityCode });
      const saved = await this.client.call(jar, 'POST', '/envia_ya/service_order/save', body);
      return { saved, origin, destination, recipient };
    });

    const data = pick(saved, (l) => l.ose_id !== undefined || l.guia !== undefined);
    if (!data?.ose_id || !data.guia) {
      throw new UpstreamError(SHALOM_PRO, 'Shalom Pro registró el envío pero no devolvió la guía: revisa tus envíos en pro.shalom.pe antes de reintentar.', { status: 502, detail: saved });
    }
    const oseId = str(data.ose_id);
    const orderNumber = str(data.guia);
    const orderCode = str(data.codigo) || null;
    // La guía ya existe en Shalom: si esto falla no se lanza (un reintento duplicaría la guía).
    const record = { userId, orderNumber, accountRef: account.ref };
    await this.prisma.shalomProShipment
      .upsert({ where: { oseId }, create: { oseId, ...record }, update: record })
      .catch((err) => this.logger.error(`No se registró la guía ${orderNumber} (ose_id ${oseId}) de ${userId}: ${String(err)}`));
    // Así el rastreo de esta guía no gasta captcha (se guarda un hash, no la clave).
    if (orderCode) {
      await guideKey(orderNumber, orderCode)
        .then((key) => this.guides.save(key, { oseId, transitTime: null }))
        .catch((err) => this.logger.warn(`No se guardó la guía ${orderNumber} en el caché: ${String(err)}`));
    }
    return {
      account: account.ref,
      orderNumber,
      series: str(data.serie) || null,
      orderCode,
      securityCode,
      oseId,
      price: num(data.precio),
      currency: 'PEN',
      service: dto.air ? 'air' : 'ground',
      package: dto.package,
      quantity: dto.quantity,
      payer: dto.payer,
      origin: { code: str(origin.ter_id), name: terminalName(origin) },
      destination: { code: str(destination.ter_id), name: terminalName(destination) },
      recipient: { document: dto.recipient.document, alreadyRegistered: recipient.existing },
      label: `/v1/shalom/shipments/${oseId}/label`,
      ticket: `/v1/shalom/shipments/${oseId}/ticket`,
      raw: data,
    };
  }

  /**
   * PDF del rótulo (etiqueta para la caja) o del ticket (comprobante). Solo de
   * guías que este cliente creó con la API: no se le pide a Shalom un ose_id ajeno.
   * Se piden con la cuenta con la que se creó la guía o, si se indica, con otra
   * de las del cliente (`ref`): sirve para guías creadas cuando reconectaba una sola
   * cuenta con otro correo antes de cada guía, que quedaron como `default`.
   */
  async document(userId: string, oseId: string, kind: 'label' | 'ticket', ref?: string): Promise<ProFile> {
    const db = this.db();
    const own = await db.shalomProShipment.findUnique({ where: { oseId } });
    if (own?.userId !== userId) throw new NotFoundException('No encontramos esa guía entre las que creaste con la API (oseId de POST /v1/shalom/shipments).');
    const account = ref ? await this.find(userId, ref) : await db.shalomProAccount.findUnique({ where: { userId_ref: { userId, ref: own.accountRef } } });
    if (!account) {
      const which = own.accountRef === DEFAULT_PRO_ACCOUNT ? 'tu cuenta de Shalom Pro' : `la cuenta de Shalom Pro "${own.accountRef}"`;
      throw new NotFoundException(`La guía se creó con ${which}, que ya no está conectada: vuelve a conectarla con ${connectPath(own.accountRef)} para descargar su rótulo y ticket.`);
    }
    return this.withSession(account, async (jar) => {
      if (kind === 'label') {
        const body = await this.client.call(jar, 'POST', '/rotulo/token', { ose_id: Number(oseId) });
        const url = pick(body, (l) => typeof l.url === 'string' && !!l.url)?.url as string | undefined;
        if (!url) throw new UpstreamError(SHALOM_PRO, 'Shalom Pro no devolvió el enlace del rótulo.', { status: 502 });
        return this.client.download(jar, url);
      }
      const body = await this.client.call(jar, 'POST', '/ticket-pdf/token', { ose_id: Number(oseId) });
      const token = pick(body, (l) => typeof l.token === 'string' && !!l.token)?.token as string | undefined;
      if (!token) throw new UpstreamError(SHALOM_PRO, 'Shalom Pro no devolvió el token del ticket.', { status: 502 });
      return this.client.download(jar, `/api/v1/ticket-pdf/${oseId}?token=${encodeURIComponent(token)}&inline=1`);
    });
  }

  // ─── Pasos del registro ────────────────────────────────────────────────────

  private terminals(jar: CookieJar): Promise<Terminal[]> {
    return this.terminalsCache.get(
      'all',
      async () => {
        const body = await this.client.call(jar, 'POST', '/envia_ya/terminals');
        return (pick(body, (l) => Array.isArray(l.Map))?.Map as Terminal[] | undefined) ?? [];
      },
      (l) => l.length > 0,
    );
  }

  private products(key: string, jar: CookieJar): Promise<Array<Record<string, any>>> {
    return this.productsCache.get(
      key,
      async () => {
        const body = await this.client.call(jar, 'POST', '/envia_ya/products');
        if (Array.isArray(body)) return body;
        return (pick(body, (l) => Array.isArray(l.data))?.data as Array<Record<string, any>> | undefined) ?? [];
      },
      (l) => l.length > 0,
    );
  }

  /** Valida la ruta con las reglas de Shalom Pro: origen que despacha, destino que recibe y aéreo. */
  private route(terminals: Terminal[], dto: ShalomShipmentDto): { origin: Terminal; destination: Terminal } {
    if (!terminals.length) throw new UpstreamError(SHALOM_PRO, 'Shalom Pro no devolvió sus agencias.', { status: 502 });
    const find = (code: string) => terminals.find((t) => str(t.ter_id) === code);
    const origin = find(dto.origin);
    const destination = find(dto.destination);
    if (!origin) throw new BadRequestException(`La agencia ${dto.origin} no está en Shalom Pro (usa el code de GET /v1/shalom/agencies).`);
    if (!destination) throw new BadRequestException(`La agencia ${dto.destination} no está en Shalom Pro (usa el code de GET /v1/shalom/agencies).`);
    if (!flag(origin.origen)) throw new BadRequestException(`Shalom Pro no despacha envíos desde ${terminalName(origin)}.`);
    if (!flag(destination.destino) || !flag(destination.ter_habilitado_OS)) {
      throw new BadRequestException(`La agencia ${terminalName(destination)} no recibe envíos de Shalom Pro.`);
    }
    if (dto.air) {
      if (!flag(destination.ter_aereo)) throw new BadRequestException(`La agencia ${terminalName(destination)} no recibe envíos aéreos.`);
      const allowed = airOrigins(destination.origenes_aereos);
      if (allowed?.length && !allowed.includes(Number(origin.ter_id))) {
        throw new BadRequestException(`No hay envío aéreo de ${terminalName(origin)} a ${terminalName(destination)}.`);
      }
    }
    return { origin, destination };
  }

  private product(products: Array<Record<string, any>>, pkg: ShalomPackage): Record<string, any> {
    const product = products.find((p) => PRODUCT_TITLES[pkg].includes(norm(p.title)));
    if (!product || product.id === undefined || product.id === null) {
      const titles = products.map((p) => str(p.title)).filter(Boolean);
      throw new UpstreamError(SHALOM_PRO, `Shalom Pro no ofrece ahora el tamaño "${pkg}"${titles.length ? ` (ofrece: ${titles.join(', ')})` : ''}.`, { status: 400 });
    }
    return product;
  }

  /** Precio del tamaño elegido entre las dos agencias (lo calcula Shalom Pro, como su formulario). */
  private async tariff(jar: CookieJar, origin: Terminal, destination: Terminal, dto: ShalomShipmentDto): Promise<number> {
    const custom = dto.package === 'custom';
    const body = await this.client.call(jar, 'POST', '/envia_ya/tariff/calculate', {
      origin: origin.ter_id,
      destiny: dto.air ? `0${destination.ter_id}` : destination.ter_id,
      width: custom ? (dto.widthCm ?? '') : '',
      height: custom ? (dto.heightCm ?? '') : '',
      length: custom ? (dto.lengthCm ?? '') : '',
      weight: custom ? (dto.weightKg ?? '') : '',
    });
    const data = pick(body, (l) => l.tariff !== undefined || l.price !== undefined);
    const price = dto.package === 'custom' ? num(data?.price) : num(data?.tariff?.[TARIFF_KEYS[dto.package]]);
    if (price === null || price <= 0) {
      const why = typeof data?.message === 'string' && data.message ? `: ${data.message}` : '';
      throw new UpstreamError(SHALOM_PRO, `Shalom Pro no tiene tarifa para ese envío${why}.`, { status: 400 });
    }
    return price;
  }

  /**
   * El destinatario va por su uuid en Shalom. Si Shalom ya lo tiene (por su
   * documento) se usa ese, con los datos que tenga registrados; si no, se crea.
   */
  private async recipient(jar: CookieJar, r: ShalomShipmentDto['recipient']): Promise<{ uuid: string; existing: boolean }> {
    const hasUuid = (l: Record<string, any>) => typeof l.uuid === 'string' && !!l.uuid;
    const found = await this.client.request(jar, 'POST', '/service-orders/recipients/search', { document: r.document });
    const existing = found.status < 400 && !failed(found.body) ? (pick(found.body, hasUuid)?.uuid as string | undefined) : undefined;
    if (existing) return { uuid: existing, existing: true };
    const saved = await this.client.call(jar, 'POST', '/service-orders/recipients/save', {
      document: r.document,
      first_name: r.name,
      last_name: r.paternalSurname ?? '',
      surname: r.maternalSurname ?? '',
      email: r.email ?? '',
      phone: r.phone,
    });
    const uuid = pick(saved, hasUuid)?.uuid as string | undefined;
    if (!uuid) throw new UpstreamError(SHALOM_PRO, 'Shalom Pro no registró al destinatario.', { status: 502 });
    return { uuid, existing: false };
  }

  // ─── Sesión ────────────────────────────────────────────────────────────────

  /** Corre `fn` con la sesión de la cuenta; si Shalom la cerró (401), entra de nuevo y reintenta una vez. */
  private async withSession<T>(account: ShalomProAccount, fn: (jar: CookieJar) => Promise<T>): Promise<T> {
    const jar = this.cached(account) ?? this.restore(account) ?? (await this.login(account));
    try {
      return await fn(jar);
    } catch (err) {
      if (!(err instanceof ShalomProSessionExpired)) throw err;
    }
    const fresh = await this.login(account);
    try {
      return await fn(fresh);
    } catch (err) {
      if (err instanceof ShalomProSessionExpired) {
        throw new UpstreamError(SHALOM_PRO, 'Shalom Pro cerró la sesión recién abierta. Inténtalo de nuevo en unos minutos.', { status: 502 });
      }
      throw err;
    }
  }

  /** Sesión en memoria, si es de la conexión vigente de la cuenta. */
  private cached(account: ShalomProAccount): CookieJar | null {
    const entry = this.sessions.get(sessionKey(account));
    return entry?.stamp === account.password ? entry.jar : null;
  }

  /** Login con la contraseña guardada (uno a la vez por cuenta) y guarda la sesión nueva. */
  private login(account: ShalomProAccount): Promise<CookieJar> {
    const key = sessionKey(account);
    const pending = this.logins.get(key);
    if (pending) return pending;
    const { userId, ref } = account;
    const run = (async () => {
      this.sessions.delete(key);
      let jar: CookieJar;
      try {
        jar = await this.client.login(account.email, this.secrets.open(account.password));
      } catch (err) {
        if (err instanceof UpstreamError && err.getStatus() === 400) {
          throw new UpstreamError(SHALOM_PRO, `${err.message} Si cambiaste la contraseña, vuelve a conectar la cuenta con ${connectPath(ref)}.`, { status: 400 });
        }
        throw err;
      }
      this.sessions.set(key, { jar, stamp: account.password });
      await this.prisma.shalomProAccount
        .update({ where: { userId_ref: { userId, ref } }, data: { session: this.seal(jar) } })
        .catch((err) => this.logger.warn(`No se guardó la sesión de Shalom Pro de ${key}: ${String(err)}`));
      return jar;
    })().finally(() => this.logins.delete(key));
    this.logins.set(key, run);
    return run;
  }

  /** Sesión guardada en la BD (otra instancia pudo abrirla). */
  private restore(account: ShalomProAccount): CookieJar | null {
    if (!account.session) return null;
    try {
      const jar = new CookieJar(JSON.parse(this.secrets.open(account.session)) as Record<string, string>);
      this.sessions.set(sessionKey(account), { jar, stamp: account.password });
      return jar;
    } catch {
      return null;
    }
  }

  private seal(jar: CookieJar): string {
    return this.secrets.seal(JSON.stringify(jar.toJSON()));
  }
}
