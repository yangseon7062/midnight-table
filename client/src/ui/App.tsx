import { connection, kickedReason, screen, toasts } from '../net/net';
import { Title } from './Title';
import { Lobby } from './Lobby';
import { RoomScreen } from './RoomScreen';

export function App() {
  const s = screen.value;
  return (
    <>
      {s === 'boot' && <div class="boot pixel">저택의 문을 여는 중…</div>}
      {s === 'title' && <Title />}
      {s === 'lobby' && <Lobby />}
      {s === 'room' && <RoomScreen />}
      <div class="grain" />
      <div class="toasts">{toasts.value.map((t) => <div key={t.id} class={`toast ${t.tone}`}>{t.text}</div>)}</div>
      {connection.value !== 'online' && s !== 'boot' && !kickedReason.value && (
        <div class="reconnect pixel"><span class="spinner" /> 연결이 끊겼습니다. 다시 연결하는 중… <span class="faint">(진행 상태는 서버에 안전하게 보관됩니다)</span></div>
      )}
      {kickedReason.value && (
        <div class="overlay-banner">
          <div class="panel modal" style={{ textAlign: 'center' }}>
            <h3>연결이 종료되었습니다</h3>
            <p class="dim">{kickedReason.value}</p>
            <button class="btn gold" onClick={() => location.reload()}>이 창에서 다시 접속</button>
          </div>
        </div>
      )}
    </>
  );
}
