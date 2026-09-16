import { useEffect, useRef, useState } from 'preact/hooks';
import { roomMeta, gameView, bus } from '../net/net';
import { WorldEngine } from '../world/engine';
import { ChatPanel } from './Chat';
import { ControlBar, PeoplePanel, RoomTopBar } from './RoomHud';
import { TablePanel } from './TablePanel';
import { clientModules } from '../modules/registry';
import { startAmbient, sfx } from '../audio/sfx';
import type { ZoneView } from '@shared/platform';

export function RoomScreen() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<WorldEngine | null>(null);
  const [zoneToast, setZoneToast] = useState<ZoneView | null | undefined>(undefined);

  useEffect(() => {
    startAmbient();
    const e = new WorldEngine(canvasRef.current!);
    setEngine(e);
    (window as any).__engine = e;
    const off = bus.on('zone:self', (z: ZoneView | null) => { setZoneToast(z); });
    return () => { off(); e.destroy(); };
  }, []);

  useEffect(() => {
    if (zoneToast === undefined) return;
    const t = setTimeout(() => setZoneToast(undefined), 2600);
    return () => clearTimeout(t);
  }, [zoneToast]);

  const meta = roomMeta.value;
  const playing = meta?.status === 'playing';
  const Module = playing && meta?.gameModuleId ? clientModules[meta.gameModuleId]?.Component : null;

  return (
    <div class={`room-screen ${playing ? 'playing' : ''}`}>
      <canvas ref={canvasRef} class="world" onContextMenu={(e) => e.preventDefault()} />
      <div class="vignette" />
      <RoomTopBar />
      <PeoplePanel />
      <ChatPanel />
      <ControlBar />
      {!playing && <TablePanel />}
      {Module && gameView.value && <Module engine={engine} />}
      {zoneToast !== undefined && (
        <div class={`zone-toast ${zoneToast ? 'in' : 'out'}`} onAnimationStart={() => sfx.whoosh()}>
          {zoneToast ? <><b class="pixel">🔒 {zoneToast.name}</b><span class="small">문이 닫혔습니다. 이제 이 구역 안의 사람끼리만 대화가 들립니다.</span></> : <><b class="pixel">📢 공용 공간</b><span class="small">구역 밖의 모두와 대화합니다.</span></>}
        </div>
      )}
    </div>
  );
}
