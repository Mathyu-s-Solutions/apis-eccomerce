'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { runStage } from './stage';

const KRAFT = '#C8925A';
const INK = '#1E293B';

// [ancho, alto, fondo, x, y, z, color, con etiqueta]
const BOXES: [number, number, number, number, number, number, string, boolean][] = [
  [2.6, 1.9, 2.0, -1.4, -0.6, 0.6, KRAFT, true],
  [1.8, 1.4, 1.6, 1.7, 0.9, 0.2, INK, true],
  [1.4, 1.1, 1.2, 0.6, -2.1, 1.6, KRAFT, false],
  [1.2, 1.2, 1.2, -2.6, 2.0, -0.6, INK, false],
  [1.0, 0.8, 1.0, 2.9, -1.6, -0.4, KRAFT, true],
  [0.8, 0.8, 0.8, -0.2, 2.6, -1.2, KRAFT, false],
  [0.7, 0.6, 0.7, 3.0, 2.6, -1.6, INK, false],
];

/** Cara de caja: cartón con cinta amarilla y, opcionalmente, etiqueta con código de barras. */
function boxTexture(base: string, label: boolean): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = base;
  x.fillRect(0, 0, 256, 256);
  x.fillStyle = 'rgba(0,0,0,.06)';
  for (let i = 0; i < 40; i++) x.fillRect((i * 97) % 256, (i * 53) % 256, 2 + ((i * 7) % 30), 1);
  x.fillStyle = '#F9B52F';
  x.fillRect(100, 0, 56, 256);
  x.fillStyle = 'rgba(2,6,23,.25)';
  x.fillRect(100, 0, 3, 256);
  x.fillRect(153, 0, 3, 256);
  if (label) {
    x.fillStyle = '#FFFFFF';
    x.fillRect(150, 150, 86, 84);
    x.fillStyle = '#020617';
    for (let b = 0; b < 16; b++) x.fillRect(158 + b * 4.5, 160, (b % 3) + 1, 34);
    x.font = 'bold 18px sans-serif';
    x.fillText('API', 172, 222);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Paquetes flotando que caen al cargar y siguen al puntero (hero de Olva). */
export default function ParcelsScene() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    return runStage(ref.current, { fov: 34, position: [0, 0.6, 13] }, ({ scene, pointer, motion }) => {
      scene.add(new THREE.HemisphereLight(0xffffff, 0x3b3218, 2.6));
      const sun = new THREE.DirectionalLight(0xffffff, 3.2);
      sun.position.set(5, 7, 9);
      scene.add(sun);

      const group = new THREE.Group();
      scene.add(group);
      const boxes = BOXES.map(([w, h, d, x, y, z, color, label], i) => {
        const plain = new THREE.MeshStandardMaterial({ map: boxTexture(color, false), roughness: 0.85 });
        const front = new THREE.MeshStandardMaterial({ map: boxTexture(color, label), roughness: 0.85 });
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [plain, plain, plain, plain, front, plain]);
        mesh.position.set(x, y, z);
        mesh.rotation.set(0.25 * Math.sin(i * 1.7), -0.5 + i * 0.35, 0.12 * Math.cos(i));
        mesh.userData = { y, rx: mesh.rotation.x, ry: mesh.rotation.y, speed: 0.5 + (i % 3) * 0.18, phase: i * 0.9 };
        group.add(mesh);
        if (motion) {
          gsap.from(mesh.position, { y: y + 9, duration: 1.4, delay: 0.2 + i * 0.12, ease: 'power3.out' });
          gsap.from(mesh.scale, { x: 0.4, y: 0.4, z: 0.4, duration: 1.2, delay: 0.2 + i * 0.12, ease: 'power3.out' });
        }
        return mesh;
      });

      return (t) => {
        group.rotation.y = pointer.x * 0.6;
        group.rotation.x = pointer.y * 0.35;
        if (!motion) return;
        for (const b of boxes) {
          const u = b.userData;
          b.rotation.y = u.ry + t * 0.18 * u.speed;
          b.rotation.x = u.rx + Math.sin(t * u.speed + u.phase) * 0.08;
          if (!gsap.isTweening(b.position)) b.position.y += (u.y + Math.sin(t * u.speed * 1.4 + u.phase) * 0.18 - b.position.y) * 0.08;
        }
      };
    });
  }, []);

  return <canvas ref={ref} aria-label="Paquetes en 3D flotando" className="absolute inset-0 block h-full w-full" />;
}
