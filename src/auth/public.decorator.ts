import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/** Marca una ruta como accesible sin API key (health, docs). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
