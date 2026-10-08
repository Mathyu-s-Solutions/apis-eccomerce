'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { gsap } from 'gsap';
import { runStage } from './stage';

// [título, serie, x, y, z, giro]
const PAPERS: [string, string, number, number, number, number][] = [
  ['NOTA DE CRÉDITO ELECTRÓNICA', 'FC01', -2.1, 0.9, -2.2, 0.22],
  ['BOLETA DE VENTA ELECTRÓNICA', 'B001', 2.2, -0.4, -1.2, -0.18],
  ['FACTURA ELECTRÓNICA', 'F001', 0, 0, 0.6, -0.06],
];

/** Representación impresa genérica de un comprobante (sin datos reales). */
function receiptTexture(title: string, serie: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 820;
  const x = c.getContext('2d')!;
  x.fillStyle = '#FFFFFF';
  x.fillRect(0, 0, 512, 820);
  x.fillStyle = '#0056AC';
  x.fillRect(0, 0, 512, 16);
  x.font = 'bold 28px sans-serif';
  x.textAlign = 'center';
  x.fillText(title, 256, 78);
  x.fillStyle = '#26292E';
  x.font = '28px monospace';
  x.fillText(`${serie}-000123`, 256, 120);
  x.strokeStyle = '#C9D2DF';
  x.setLineDash([8, 8]);
  x.lineWidth = 2;
  for (const y of [150, 300, 560]) {
    x.beginPath();
    x.moveTo(32, y);
    x.lineTo(480, y);
    x.stroke();
  }
  x.setLineDash([]);
  for (let i = 0; i < 4; i++) {
    x.fillStyle = '#9AA6B5';
    x.fillRect(40, 182 + i * 28, 200 + ((i * 37) % 90), 12);
    x.fillRect(400, 182 + i * 28, 70, 12);
  }
  for (let j = 0; j < 6; j++) {
    x.fillStyle = j % 2 ? '#C9D2DF' : '#9AA6B5';
    x.fillRect(40, 330 + j * 32, 240 - ((j * 23) % 80), 14);
    x.fillRect(390, 330 + j * 32, 80, 14);
  }
  x.fillStyle = '#26292E';
  x.font = 'bold 30px sans-serif';
  x.textAlign = 'left';
  x.fillText('TOTAL', 40, 610);
  x.textAlign = 'right';
  x.fillText('S/ 118.00', 472, 610);
  x.textAlign = 'left';
  x.font = '20px sans-serif';
  x.fillStyle = '#5D6470';
  x.fillText('IGV 18%', 40, 645);
  x.fillStyle = '#26292E';
  for (let a = 0; a < 9; a++)
    for (let b = 0; b < 9; b++)
      if ((a * 7 + b * 3 + a * b) % 3 !== 0 || (a < 3 && b < 3) || (a < 3 && b > 5) || (a > 5 && b < 3)) x.fillRect(40 + a * 14, 680 + b * 14, 12, 12);
  x.save();
  x.translate(380, 730);
  x.rotate(-0.16);
  x.strokeStyle = '#CF000B';
  x.lineWidth = 5;
  x.strokeRect(-90, -30, 180, 60);
  x.fillStyle = '#CF000B';
  x.font = 'bold 28px sans-serif';
  x.textAlign = 'center';
  x.fillText('ACEPTADO', 0, 10);
  x.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Comprobantes que se "imprimen" y flotan (hero de SUNAT). */
export default function ReceiptsScene() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    return runStage(ref.current, { fov: 32, position: [0, 0, 16.5] }, ({ scene, pointer, motion }) => {
      scene.add(new THREE.AmbientLight(0xffffff, 2.4));
      const sun = new THREE.DirectionalLight(0xffffff, 2.2);
      sun.position.set(3, 4, 8);
      scene.add(sun);

      const group = new THREE.Group();
      scene.add(group);
      const papers = PAPERS.map(([title, serie, x, y, z, rz], i) => {
        const geo = new THREE.PlaneGeometry(4.2, 6.7, 1, 40);
        const p = geo.attributes.position;
        for (let k = 0; k < p.count; k++) p.setZ(k, Math.sin((p.getY(k) + 3.35) * 0.55) * 0.18);
        geo.computeVertexNormals();
        const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: receiptTexture(title, serie), side: THREE.DoubleSide, roughness: 0.9 }));
        mesh.position.set(x, y, z);
        mesh.rotation.z = rz;
        mesh.userData = { y, rz, phase: i * 1.3 };
        group.add(mesh);
        if (motion) {
          gsap.from(mesh.scale, { y: 0.02, duration: 1.3, delay: 0.25 + i * 0.25, ease: 'power3.out' });
          gsap.from(mesh.position, { y: y + 3.3, duration: 1.3, delay: 0.25 + i * 0.25, ease: 'power3.out' });
        }
        return mesh;
      });

      return (t) => {
        group.rotation.y = -0.25 + pointer.x * 0.7 + (motion ? Math.sin(t * 0.3) * 0.08 : 0);
        group.rotation.x = pointer.y * 0.4;
        if (!motion) return;
        for (const m of papers) {
          const u = m.userData;
          if (!gsap.isTweening(m.position)) m.position.y += (u.y + Math.sin(t * 0.8 + u.phase) * 0.14 - m.position.y) * 0.08;
          m.rotation.z = u.rz + Math.sin(t * 0.5 + u.phase) * 0.03;
        }
      };
    });
  }, []);

  return <canvas ref={ref} aria-label="Comprobantes electrónicos en 3D" className="absolute inset-0 block h-full w-full" />;
}
