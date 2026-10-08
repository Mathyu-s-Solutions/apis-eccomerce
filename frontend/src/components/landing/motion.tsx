'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { gsap } from 'gsap';

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Aparece al entrar en pantalla. El contenido se renderiza visible en el servidor; solo se
 * oculta en el cliente si está por debajo del pliegue, así nunca queda escondido sin JS.
 */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || el.getBoundingClientRect().top < window.innerHeight * 0.9) return;

    gsap.set(el, { y: 48, autoAlpha: 0 });
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        gsap.to(el, { y: 0, autoAlpha: 1, duration: 0.9, delay, ease: 'power3.out', clearProps: 'transform,opacity,visibility' });
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      gsap.killTweensOf(el);
      gsap.set(el, { clearProps: 'transform,opacity,visibility' });
    };
  }, [delay]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Entrada escalonada de los hijos directos (para el hero). */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const tween = gsap.from(el.children, {
      y: 36,
      opacity: 0,
      duration: 0.9,
      stagger: 0.08,
      ease: 'power3.out',
      clearProps: 'transform,opacity',
    });
    return () => {
      tween.revert();
    };
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

/** Número que cuenta desde 0 al montarse. En el servidor ya sale con su valor final. */
export function CountUp({ value, suffix = '', className }: { value: number; suffix?: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const format = (n: number) => `${Math.round(n).toLocaleString('es-PE')}${suffix}`;

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    const counter = { v: 0 };
    const tween = gsap.to(counter, {
      v: value,
      duration: 1.8,
      delay: 0.4,
      ease: 'power2.out',
      onUpdate: () => {
        el.textContent = format(counter.v);
      },
    });
    return () => {
      tween.kill();
      el.textContent = format(value);
    };
    // format solo depende de suffix
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, suffix]);

  return (
    <span ref={ref} className={className}>
      {format(value)}
    </span>
  );
}

/** Cinta con desplazamiento infinito; el contenido se duplica para el bucle. */
export function Marquee({ items, className, separator = '✦' }: { items: string[]; className?: string; separator?: string }) {
  const row = (hidden: boolean) => (
    <div className="flex shrink-0 gap-9 pr-9 whitespace-nowrap" aria-hidden={hidden || undefined}>
      {items.map((item) => (
        <span key={item} className="flex gap-9">
          <span>{item}</span>
          <span aria-hidden className="opacity-70">{separator}</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className={`marquee overflow-hidden ${className ?? ''}`}>
      <div className="marquee-track">
        {row(false)}
        {row(true)}
      </div>
    </div>
  );
}
