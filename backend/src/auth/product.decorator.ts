import { SetMetadata } from '@nestjs/common';

export const PRODUCTS = ['shalom', 'olva', 'sunat'] as const;
export type Product = (typeof PRODUCTS)[number];

export const PRODUCT_LABEL: Record<Product | 'all', string> = {
  shalom: 'Shalom',
  olva: 'Olva',
  sunat: 'SUNAT',
  all: 'todas las APIs',
};

export const PRODUCT_KEY = 'billing:product';

/**
 * API a la que pertenece un controller. La key tiene que ser de esa API (o de
 * todas) y la cuota sale del plan del cliente para esa API.
 */
export const ForProduct = (product: Product) => SetMetadata(PRODUCT_KEY, product);
