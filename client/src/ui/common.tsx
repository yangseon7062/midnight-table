import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import type { AvatarLook, Facing } from '@shared/platform';
import { avatarSprite } from '../world/avatar';
import { createPortal } from 'preact/compat';

/** position:fixed 오버레이가 backdrop-filter/transform 부모에 갇히지 않도록 body 로 올린다 */
export function Portal(props: { children: ComponentChildren }) { return createPortal(props.children as any, document.body); }

export function Modal(props: { title?: string; onClose?: () => void; children: ComponentChildren; width?: number; className?: string }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose?.(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [props.onClose]);
  return (
    <Portal>
    <div class="modal-back" onPointerDown={(e) => { if (e.target === e.currentTarget) props.onClose?.(); }}>
      <div class={`modal panel ${props.className ?? ''}`} style={props.width ? { width: `min(${props.width}px, calc(100vw - 32px))` } : undefined}>
        {props.title && <h3>{props.title}</h3>}
        {props.children}
      </div>
    </div>
    </Portal>
  );
}

/** 도트 아바타 미리보기 */
export function AvatarPreview(props: { look: AvatarLook; size?: number; facing?: Facing; walking?: boolean; spin?: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const size = props.size ?? 4;
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const loop = (t: number) => {
      const cv = ref.current;
      if (!cv) return;
      const g = cv.getContext('2d')!;
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, cv.width, cv.height);
      const el = (t - start) / 1000;
      const facings: Facing[] = ['down', 'left', 'up', 'right'];
      const facing = props.spin ? facings[Math.floor(el / 1.4) % 4] : props.facing ?? 'down';
      const frame = props.walking ? Math.floor(el * 8) % 4 : 0;
      const spr = avatarSprite(props.look, facing, frame);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.ellipse(cv.width / 2, cv.height - size * 2, size * 6, size * 2.2, 0, 0, Math.PI * 2); g.fill();
      g.drawImage(spr, 0, 0, spr.width, spr.height, (cv.width - spr.width * size) / 2, cv.height - spr.height * size - size, spr.width * size, spr.height * size);
      if (props.walking || props.spin) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [props.look, props.facing, props.walking, props.spin, size]);
  return <canvas ref={ref} width={20 * size} height={28 * size} style={{ imageRendering: 'pixelated', width: `${20 * size}px`, height: `${28 * size}px` }} />;
}

export function fmtTime(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
