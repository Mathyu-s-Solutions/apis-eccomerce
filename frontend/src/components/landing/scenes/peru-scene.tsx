'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { departmentRings, PERU_MAP } from '@/lib/peru-map';
import { loadAgencies } from '../agencies';
import { runStage } from './stage';

const SCALE = 0.0118;
const DEPTH = 0.16;
// Ciudades con pulso: Lima, Arequipa, Trujillo, Cusco, Piura.
const PULSES: [number, number][] = [
  [-12.05, -77.03],
  [-16.4, -71.54],
  [-8.11, -79.03],
  [-13.53, -71.97],
  [-5.19, -80.63],
];

/** Mapa 3D del Perú con una barra por agencia de Shalom; la altura sigue la densidad local. */
export default function PeruScene() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    return runStage(ref.current, { fov: 30, position: [0, -9.5, 12.5], lookAt: [0, 0.2, 0] }, (stage) => {
      const { scene, pointer, motion } = stage;
      scene.add(new THREE.AmbientLight(0xffffff, 1.7));
      const sun = new THREE.DirectionalLight(0xffffff, 2.6);
      sun.position.set(-5, -6, 10);
      scene.add(sun);
      const glow = new THREE.PointLight(0xee2a2f, 14, 8);
      glow.position.set(-1.2, -1.6, 2.4);
      scene.add(glow);

      const group = new THREE.Group();
      group.rotation.x = -0.12;
      scene.add(group);

      const cx = PERU_MAP.width / 2;
      const cy = PERU_MAP.height / 2;
      const toWorld = (x: number, y: number): [number, number] => [(x - cx) * SCALE, (cy - y) * SCALE];

      const top = new THREE.MeshStandardMaterial({ color: 0x33427a, roughness: 0.7, metalness: 0.05 });
      const side = new THREE.MeshStandardMaterial({ color: 0x141c3b, roughness: 0.9 });
      const line = new THREE.LineBasicMaterial({ color: 0x8c9bd6, transparent: true, opacity: 0.5 });
      for (const ring of departmentRings()) {
        const shape = new THREE.Shape(ring.map(([x, y]) => new THREE.Vector2(...toWorld(x, y))));
        const geo = new THREE.ExtrudeGeometry(shape, { depth: DEPTH, bevelEnabled: false });
        group.add(new THREE.Mesh(geo, [top, side]));
        group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), line));
      }

      const rings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[] = [];
      loadAgencies('shalom')
        .then(({ agencies }) => {
          if (stage.disposed()) return;
          const pos = agencies.map((a) => toWorld((a.x / 100) * PERU_MAP.width, (a.y / 100) * PERU_MAP.height));
          const heights = pos.map(([px, py]) => {
            let near = 0;
            for (const [qx, qy] of pos) if ((qx - px) ** 2 + (qy - py) ** 2 < 0.09) near++;
            return Math.min(2.6, 0.18 + Math.sqrt(near) * 0.2);
          });
          // Las barras crecen de norte a sur.
          const order = pos.map(([, py]) => (py + 5) / 10);

          const bar = new THREE.BoxGeometry(0.045, 0.045, 1);
          bar.translate(0, 0, 0.5);
          const bars = new THREE.InstancedMesh(
            bar,
            new THREE.MeshStandardMaterial({ color: 0xee2a2f, emissive: 0xee2a2f, emissiveIntensity: 0.45, roughness: 0.4 }),
            pos.length,
          );
          group.add(bars);
          const m = new THREE.Matrix4();
          const q = new THREE.Quaternion();
          const v = new THREE.Vector3();
          const s = new THREE.Vector3();
          const grow = { t: motion ? 0 : 1 };
          const update = () => {
            pos.forEach(([px, py], i) => {
              let k = Math.max(0, Math.min(1, grow.t * 1.6 - (1 - order[i]) * 0.6));
              k = 1 - (1 - k) ** 3;
              m.compose(v.set(px, py, DEPTH), q, s.set(1, 1, Math.max(0.001, heights[i] * k)));
              bars.setMatrixAt(i, m);
            });
            bars.instanceMatrix.needsUpdate = true;
          };
          update();
          if (motion) gsap.to(grow, { t: 1, duration: 2.6, delay: 0.3, ease: 'power2.out', onUpdate: update });

          const ringGeo = new THREE.RingGeometry(0.16, 0.2, 40);
          PULSES.forEach(([lat, lng], i) => {
            let best = agencies[0];
            for (const a of agencies) if (Math.abs(a.lat - lat) + Math.abs(a.lng - lng) < Math.abs(best.lat - lat) + Math.abs(best.lng - lng)) best = a;
            const r = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0xee2a2f, transparent: true, side: THREE.DoubleSide }));
            r.position.set(...toWorld((best.x / 100) * PERU_MAP.width, (best.y / 100) * PERU_MAP.height), DEPTH + 0.01);
            r.userData.offset = i * 0.45;
            group.add(r);
            rings.push(r);
          });
        })
        .catch(() => {});

      return (t) => {
        group.rotation.z = (motion ? Math.sin(t * 0.25) * 0.1 : 0) + pointer.x * 0.35;
        group.rotation.x = -0.12 + pointer.y * 0.18;
        for (const r of rings) {
          const p = motion ? (t * 0.55 + r.userData.offset) % 1 : 0.4;
          r.scale.setScalar(0.4 + p * 2.2);
          r.material.opacity = 0.9 * (1 - p);
        }
      };
    });
  }, []);

  return <canvas ref={ref} aria-label="Mapa 3D del Perú con las agencias de Shalom" className="absolute inset-0 block h-full w-full" />;
}
