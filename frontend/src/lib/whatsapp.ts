/**
 * WhatsApp de un cliente: por ahí suelen escribir y pagar. Se guarda solo con
 * dígitos y código de país (51 para Perú) para armar el link wa.me.
 */

/** "987 654 321", "+51 987654321" o "51987654321" → "51987654321". Null si no parece un número. */
export function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (/^9\d{8}$/.test(digits)) return `51${digits}`; // celular peruano sin código de país
  if (/^\d{10,15}$/.test(digits)) return digits;
  return null;
}

/** "51987654321" → "+51 987 654 321". */
export function formatPhone(digits: string): string {
  const m = digits.match(/^51(\d{3})(\d{3})(\d{3})$/);
  return m ? `+51 ${m[1]} ${m[2]} ${m[3]}` : `+${digits}`;
}

/** Abre el chat con el cliente, con el mensaje ya escrito. */
export function whatsappHref(phone: string, text?: string): string {
  return `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}
