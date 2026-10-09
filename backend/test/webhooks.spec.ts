import { createHmac } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { checkWebhookUrl, isPrivateAddress } from '../src/modules/webhooks/url-guard';
import { newWebhookSecret, signWebhook } from '../src/modules/webhooks/webhook-sender';
import { fingerprint, nextCheck } from '../src/modules/webhooks/tracking-subscriptions.service';
import { ShipmentStatus, type TrackingResult } from '../src/common/courier/tracking.model';

describe('URL del webhook (SSRF)', () => {
  it('solo https a hosts públicos, sin credenciales', () => {
    expect(checkWebhookUrl('https://hooks.mitienda.pe/olva').hostname).toBe('hooks.mitienda.pe');
    for (const bad of [
      'http://hooks.mitienda.pe/x',
      'https://localhost/x',
      'https://api.internal/x',
      'https://169.254.169.254/computeMetadata/v1/',
      'https://10.0.0.5/x',
      'https://[::1]/x',
      'https://user:pass@hooks.mitienda.pe/x',
      'no es una url',
    ]) {
      expect(() => checkWebhookUrl(bad), bad).toThrow(BadRequestException);
    }
  });

  it('reconoce IPs privadas y reservadas (también IPv4 dentro de IPv6)', () => {
    for (const ip of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', 'fd00::1', 'fe80::1', '::ffff:10.0.0.1']) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
    for (const ip of ['8.8.8.8', '190.81.0.1', '2800:200::1']) expect(isPrivateAddress(ip), ip).toBe(false);
    expect(isPrivateAddress('hooks.mitienda.pe')).toBe(true); // no es una IP
  });
});

describe('firma', () => {
  it('HMAC-SHA256 de "<t>.<cuerpo>" con el secreto', () => {
    const secret = newWebhookSecret();
    expect(secret).toMatch(/^whsec_[0-9a-f]{48}$/);
    const body = '{"type":"webhook.test"}';
    const header = signWebhook(secret, 1700000000, body);
    const expected = createHmac('sha256', secret).update(`1700000000.${body}`).digest('hex');
    expect(header).toBe(`t=1700000000,v1=${expected}`);
    expect(signWebhook(secret, 1700000000, `${body} `)).not.toBe(header);
  });
});

describe('cuándo hay aviso y cuándo se revisa', () => {
  const t = (status: ShipmentStatus, events: Array<[string, string]>): TrackingResult => ({
    carrier: 'olva',
    trackingNumber: '1',
    status,
    delivered: status === ShipmentStatus.DELIVERED,
    deliveredAt: null,
    transitTime: null,
    destination: null,
    events: events.map(([at, rawStatus]) => ({ status, at, rawStatus })),
  });

  it('cambia la huella con un estado o un evento nuevo, no con lo mismo', () => {
    const a = t(ShipmentStatus.IN_TRANSIT, [['2026-09-18', 'EN VALIJA']]);
    expect(fingerprint(a)).toBe(fingerprint(t(ShipmentStatus.IN_TRANSIT, [['2026-09-18', 'EN VALIJA']])));
    expect(fingerprint(a)).not.toBe(fingerprint(t(ShipmentStatus.IN_TRANSIT, [['2026-09-18', 'EN VALIJA'], ['2026-09-19', 'DESPACHADO']])));
    expect(fingerprint(a)).not.toBe(fingerprint(t(ShipmentStatus.AT_DESTINATION, [['2026-09-18', 'EN VALIJA']])));
  });

  it('revisa más seguido cuando la guía está cerca de llegar', () => {
    const now = new Date('2026-10-09T12:00:00Z');
    const mins = (s: ShipmentStatus) => (nextCheck(s, now).getTime() - now.getTime()) / 60_000;
    expect(mins(ShipmentStatus.REGISTERED)).toBe(120);
    expect(mins(ShipmentStatus.IN_TRANSIT)).toBe(60);
    expect(mins(ShipmentStatus.OUT_FOR_DELIVERY)).toBe(30);
  });
});
