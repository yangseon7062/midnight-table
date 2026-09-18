import { useEffect, useRef, useState } from 'preact/hooks';
import { gameView, leaveRoom, me, members, membersVersion, roomMeta, serverNow, socket, zones } from '../net/net';
import { micState, setMic, setVoiceVolume, voicePeers } from '../audio/voice';
import { audioPrefs, setVolume, sfx } from '../audio/sfx';
import { AvatarPreview, Modal } from './common';
import { ProfileEditor } from './Lobby';

export function RoomTopBar() {
  const meta = roomMeta.value;
  const [confirm, setConfirm] = useState(false);
  if (!meta) return null;
  const playing = meta.status === 'playing';
  const isPlayer = !!gameView.value?.me?.participant;
  return (
    <div class="room-top panel">
      <span class="mono faint">No.{String(meta.no).padStart(3, '0')}</span>
      <b class="pixel">{meta.title}</b>
      {meta.hasPassword && <span title="비밀번호 방">🔒</span>}
      <span class={`chip ${playing ? 'red' : 'green'}`}>{playing ? '게임 진행 중' : '대기 중'}</span>
      <button class="btn sm ghost" onClick={() => (playing && isPlayer ? setConfirm(true) : leaveRoom())}>나가기</button>
      {confirm && (
        <Modal title="게임 도중 나가시겠어요?" onClose={() => setConfirm(false)}>
          <p class="dim" style={{ marginTop: 0, lineHeight: 1.6 }}>나가면 내 캐릭터는 <b>부재 처리</b>되어 확인·투표가 자동으로 넘어갑니다.<br />같은 브라우저로 다시 이 방에 들어오면 열람한 자료, 카드, 위치 그대로 복귀할 수 있어요.</p>
          <div class="row" style={{ justifyContent: 'flex-end' }}>
            <button class="btn ghost" onClick={() => setConfirm(false)}>계속하기</button>
            <button class="btn red" onClick={() => { setConfirm(false); leaveRoom(); }}>나가기</button>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function PeoplePanel() {
  membersVersion.value;
  const [open, setOpen] = useState(true);
  const [, force] = useState(0);
  useEffect(() => { const t = setInterval(() => force((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  const list = [...members.values()].sort((a, b) => (a.role === b.role ? a.nickname.localeCompare(b.nickname) : a.role === 'player' ? -1 : 1));
  const grace = roomMeta.value?.graceMs ?? 120000;
  const peers = new Set(voicePeers.value);
  return (
    <div class={`people panel ${open ? '' : 'collapsed'}`}>
      <button class="people-head pixel" onClick={() => setOpen(!open)}>참가자 {list.filter((m) => m.connected).length}명 <span class="faint">{open ? '▾' : '▸'}</span></button>
      {open && (
        <ul>
          {list.map((m) => {
            const zone = zones.value.find((z) => z.occupants.includes(m.userId));
            const left = m.disconnectedAt ? grace - (serverNow() - m.disconnectedAt) : 0;
            const hearable = m.userId === me.value?.userId || peers.has(m.userId);
            return (
              <li key={m.userId} class={`${m.connected ? '' : 'off'} ${m.userId === me.value?.userId ? 'me' : ''}`}>
                <div class="mini-av"><AvatarPreview look={m.look} size={1} /></div>
                <div class="grow">
                  <div class="row" style={{ gap: 5 }}>
                    <b>{m.badge ?? m.nickname}</b>
                    {m.badge && <span class="faint tiny">{m.nickname}</span>}
                    {m.role === 'spectator' && <span class="chip tiny">관전</span>}
                  </div>
                  <div class="tiny faint">
                    {!m.connected ? (left > 0 ? `연결 끊김 · ${Math.ceil(left / 1000)}초 내 복귀 대기` : '부재 중') : zone ? `📍 ${zone.name}${zone.open ? (hearable ? '' : ' (대화 안 들림)') : ''}` : m.seat ? '🪑 테이블' : '홀'}
                  </div>
                </div>
                <span class={`mic-dot ${m.mic} ${m.speaking > 0.08 ? 'speaking' : ''}`} title={m.mic === 'on' ? '마이크 켜짐' : m.mic === 'off' ? '마이크 꺼짐' : '마이크 없음'}>{m.mic === 'on' ? '🎙' : '🔇'}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

const EMOTES = ['👋', '👍', '❗', '❓', '🤔', '😮', '😂', '🙏'];

export function ControlBar() {
  const [settings, setSettings] = useState(false);
  const [profile, setProfile] = useState(false);
  const [emotes, setEmotes] = useState(false);
  const [lastEmote, setLastEmote] = useState<string | null>(null);
  const emoteWrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (e.key === 'm' || e.key === 'M') { setMic(micState.value !== 'on'); }
      const n = Number(e.key);
      if (e.altKey && n >= 1 && n <= EMOTES.length) socket.emit('emote', { e: EMOTES[n - 1] });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  // 표현 목록은 골라도 닫히지 않는다 (연속으로 쓰기 위해). 바깥 클릭·ESC·표현 버튼으로만 닫는다.
  useEffect(() => {
    if (!emotes) return;
    const onDown = (e: PointerEvent) => { if (!emoteWrap.current?.contains(e.target as Node)) setEmotes(false); };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') setEmotes(false); };
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onEsc);
    return () => { document.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onEsc); };
  }, [emotes]);
  useEffect(() => {
    if (!lastEmote) return;
    const t = setTimeout(() => setLastEmote(null), 420);
    return () => clearTimeout(t);
  }, [lastEmote]);
  const mic = micState.value;
  const mine = me.value ? members.get(me.value.userId) : null;
  return (
    <div class="controls">
      <button class={`ctl mic ${mic}`} onClick={() => { setMic(mic !== 'on'); sfx.click(); }} title="마이크 켜기/끄기 (M)">
        <span class="ico">{mic === 'on' ? '🎙️' : '🔇'}</span>
        <span class="pixel tiny">{mic === 'on' ? '마이크 켜짐' : mic === 'none' ? '마이크 없음' : '마이크 꺼짐'}</span>
      </button>
      <div class="ctl-wrap" ref={emoteWrap}>
        <button class={`ctl ${emotes ? 'on' : ''}`} onClick={() => setEmotes(!emotes)} title="감정 표현 (Alt+1~8)"><span class="ico">😮</span><span class="pixel tiny">표현</span></button>
        {emotes && (
          <div class="emote-pop panel">
            <div class="emote-grid">
              {EMOTES.map((e, i) => (
                <button key={e} class={lastEmote === e ? 'sent' : ''}
                  onClick={() => { socket.emit('emote', { e }); setLastEmote(e); sfx.click(); }}
                  title={`Alt+${i + 1}`}>{e}</button>
              ))}
            </div>
            <div class="emote-foot">
              <span class="tiny faint pixel">계속 고를 수 있어요</span>
              <button class="emote-close" onClick={() => setEmotes(false)} title="닫기 (ESC)">닫기</button>
            </div>
          </div>
        )}
      </div>
      {mine?.seat && <button class="ctl" onClick={() => { socket.emit('stand'); sfx.sit(); }}><span class="ico">🚶</span><span class="pixel tiny">일어서기</span></button>}
      <button class="ctl" onClick={() => setProfile(true)}><span class="ico">🎩</span><span class="pixel tiny">꾸미기</span></button>
      <button class="ctl" onClick={() => setSettings(true)}><span class="ico">⚙️</span><span class="pixel tiny">설정</span></button>
      {settings && <SettingsModal onClose={() => setSettings(false)} />}
      {profile && <ProfileEditor onClose={() => setProfile(false)} />}
    </div>
  );
}

function SettingsModal(props: { onClose: () => void }) {
  const [v, setV] = useState({ ...audioPrefs });
  const change = (k: 'sfx' | 'ambient' | 'voice', val: number) => {
    setV({ ...v, [k]: val }); setVolume(k, val);
    if (k === 'voice') setVoiceVolume(val);
    if (k === 'sfx') sfx.paper();
  };
  return (
    <Modal title="설정" onClose={props.onClose}>
      <div class="col" style={{ gap: 16 }}>
        {([['voice', '음성 채팅 볼륨'], ['sfx', '효과음'], ['ambient', '배경 소리 (빗소리)']] as const).map(([k, label]) => (
          <div class="field" key={k}><label>{label} — {Math.round(v[k] * 100)}%</label><input type="range" min={0} max={1} step={0.05} value={v[k]} onInput={(e) => change(k, Number((e.target as HTMLInputElement).value))} /></div>
        ))}
        <div class="small dim" style={{ lineHeight: 1.7 }}>
          <b class="pixel">단축키</b><br />
          이동 <kbd>WASD</kbd>/방향키/클릭 · 앉기 <kbd>E</kbd> · 채팅 <kbd>Enter</kbd> · 마이크 <kbd>M</kbd> · 감정표현 <kbd>Alt</kbd>+<kbd>1~8</kbd>
        </div>
        <div class="row" style={{ justifyContent: 'flex-end' }}><button class="btn gold" onClick={props.onClose}>닫기</button></div>
      </div>
    </Modal>
  );
}
