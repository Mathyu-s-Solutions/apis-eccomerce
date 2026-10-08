'use client';

import dynamic from 'next/dynamic';

// three.js pesa ~600 KB: cada escena se carga aparte y solo en el cliente.
export const PeruScene = dynamic(() => import('./peru-scene'), { ssr: false });
export const ParcelsScene = dynamic(() => import('./parcels-scene'), { ssr: false });
export const ReceiptsScene = dynamic(() => import('./receipts-scene'), { ssr: false });
