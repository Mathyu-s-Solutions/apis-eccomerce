'use client';

import { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { prefersReducedMotion } from './motion';

gsap.registerPlugin(MotionPathPlugin);

// Destinos de ejemplo con estados normalizados; color con contraste AA sobre el fondo claro.
const DESTINATIONS: { city: string; status: string; color: string }[] = [
  { city: 'Arequipa', status: 'DELIVERED', color: '#15803D' },
  { city: 'Trujillo', status: 'OUT_FOR_DELIVERY', color: '#2546BB' },
  { city: 'Cusco', status: 'IN_TRANSIT', color: '#B45309' },
  { city: 'Piura', status: 'AT_DESTINATION', color: '#2546BB' },
  { city: 'Huancayo', status: 'IN_TRANSIT', color: '#B45309' },
  { city: 'Iquitos', status: 'REGISTERED', color: '#475569' },
];

const rowY = (i: number) => 40 + i * 64;

/** Seis paquetes que salen de la tienda hacia distintas ciudades (rastreo en lote). */
export function BatchRoutes() {
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const root = svg.current;
    if (!root) return;
    const paths = root.querySelectorAll<SVGPathElement>('[data-route]');
    const pkgs = root.querySelectorAll<SVGGElement>('[data-pkg]');
    const still = prefersReducedMotion();
    const ctx = gsap.context(() => {
      pkgs.forEach((pkg, i) => {
        const path = paths[i];
        const motionPath = { path, align: path, alignOrigin: [0.5, 0.5] as [number, number] };
        if (still) gsap.set(pkg, { motionPath: { ...motionPath, start: 0.6, end: 0.6 } });
        else gsap.to(pkg, { motionPath, duration: 3.4, delay: i * 0.45, repeat: -1, repeatDelay: 0.6, ease: 'power1.inOut' });
      });
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <svg
      ref={svg}
      viewBox="0 0 760 400"
      role="img"
      aria-label="Seis envíos saliendo de tu tienda en Lima hacia Arequipa, Trujillo, Cusco, Piura, Huancayo e Iquitos"
      className="block h-auto w-full"
    >
      {DESTINATIONS.map((_, i) => (
        <path
          key={i}
          data-route
          d={`M90 200C320 200 340 ${rowY(i)} 560 ${rowY(i)}`}
          className="route-dash"
          fill="none"
          stroke="#CBD5E1"
          strokeWidth={2}
        />
      ))}
      <circle cx="90" cy="200" r="46" fill="var(--signature)" stroke="#020617" strokeWidth={2} />
      <text x="90" y="196" textAnchor="middle" className="fill-[#020617] text-[14px] font-extrabold">Tu tienda</text>
      <text x="90" y="214" textAnchor="middle" className="fill-[#020617] text-[12px]">Lima</text>
      {DESTINATIONS.map((_, i) => (
        <g key={i} data-pkg>
          <rect x={-9} y={-7} width={18} height={14} rx={2} fill="var(--signature)" stroke="#020617" strokeWidth={1.5} />
          <path d="M-9 -2H9" stroke="#020617" strokeWidth={1.5} />
        </g>
      ))}
      {DESTINATIONS.map((d, i) => (
        <g key={d.city}>
          <circle cx="560" cy={rowY(i)} r="6" fill="#020617" />
          <text x="578" y={rowY(i) - 4} className="fill-[#020617] text-[15px] font-bold">{d.city}</text>
          <text x="578" y={rowY(i) + 14} fill={d.color} className="font-mono text-[12px]">{d.status}</text>
        </g>
      ))}
    </svg>
  );
}
