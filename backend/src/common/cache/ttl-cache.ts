/**
 * Caché en memoria con vencimiento, por instancia de Cloud Run. Varias llamadas
 * a la vez con la misma clave esperan una sola carga al upstream.
 * Para catálogos (agencias, ubigeos) que cambian poco: así los endpoints
 * gratuitos no le pegan a las webs de Shalom y Olva en cada request.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, { value: T; expires: number }>();
  private readonly loading = new Map<string, Promise<T>>();

  constructor(private readonly ttlMs: number) {}

  /** `keep` decide si el valor se guarda (p. ej. no guardar una lista vacía). */
  async get(key: string, load: () => Promise<T>, keep: (value: T) => boolean = () => true): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && hit.expires > Date.now()) return hit.value;
    const pending = this.loading.get(key);
    if (pending) return pending;

    const p = load()
      .then((value) => {
        if (keep(value)) this.entries.set(key, { value, expires: Date.now() + this.ttlMs });
        return value;
      })
      .finally(() => this.loading.delete(key));
    this.loading.set(key, p);
    return p;
  }

  clear(): void {
    this.entries.clear();
  }
}
