import * as THREE from 'three';
import { prefersReducedMotion } from '../motion';

export interface Stage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Posición del puntero sobre el lienzo, suavizada, en [-0.5, 0.5]. */
  pointer: { x: number; y: number };
  /** false si el usuario pidió reducir el movimiento. */
  motion: boolean;
  /** true después del cleanup (para cargas asíncronas). */
  disposed: () => boolean;
}

interface Options {
  fov: number;
  position: [number, number, number];
  lookAt?: [number, number, number];
}

/**
 * Monta una escena three.js sobre un <canvas> que llena a su contenedor: tamaño, puntero,
 * pausa fuera de pantalla y liberación de recursos. `build` arma la escena y devuelve el
 * paso de animación por frame. Devuelve el cleanup para el useEffect.
 */
export function runStage(canvas: HTMLCanvasElement, opts: Options, build: (stage: Stage) => (t: number) => void): () => void {
  const box = canvas.parentElement ?? canvas;
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch {
    return () => {}; // sin WebGL: el hero se queda sin 3D, el resto de la página funciona
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(opts.fov, 1, 0.1, 100);
  camera.position.set(...opts.position);
  camera.lookAt(...(opts.lookAt ?? [0, 0, 0]));

  const fit = () => {
    const w = box.clientWidth;
    const h = box.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  };
  fit();
  const ro = new ResizeObserver(fit);
  ro.observe(box);

  const target = { x: 0, y: 0 };
  const pointer = { x: 0, y: 0 };
  const onMove = (e: PointerEvent) => {
    const r = box.getBoundingClientRect();
    target.x = (e.clientX - r.left) / r.width - 0.5;
    target.y = (e.clientY - r.top) / r.height - 0.5;
  };
  const onLeave = () => {
    target.x = 0;
    target.y = 0;
  };
  box.addEventListener('pointermove', onMove);
  box.addEventListener('pointerleave', onLeave);

  let visible = true;
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
  });
  io.observe(box);

  let disposed = false;
  const step = build({ scene, camera, pointer, motion: !prefersReducedMotion(), disposed: () => disposed });

  const timer = new THREE.Timer();
  let raf = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (!visible) return;
    timer.update(now);
    pointer.x += (target.x - pointer.x) * 0.06;
    pointer.y += (target.y - pointer.y) * 0.06;
    step(timer.getElapsed());
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(loop);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    box.removeEventListener('pointermove', onMove);
    box.removeEventListener('pointerleave', onLeave);
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      mesh.geometry?.dispose();
      const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
      for (const m of mats) {
        (m as THREE.MeshStandardMaterial).map?.dispose();
        m.dispose();
      }
    });
    renderer.dispose();
  };
}
