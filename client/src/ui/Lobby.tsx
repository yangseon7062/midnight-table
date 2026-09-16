import { useEffect, useState } from 'preact/hooks';
import { LIMITS } from '@shared/platform';
import type { RoomSummary } from '@shared/platform';
import { joinRoom, me, modules, refreshRooms, rooms, call, toast, screen, storage, socket } from '../net/net';
import { AvatarPreview, Modal } from './common';
import { AvatarEditor } from './AvatarEditor';
import { sfx, startAmbient } from '../audio/sfx';

export function Lobby() {
  const [creating, setCreating] = useState(false);
  const [pwFor, setPwFor] = useState<RoomSummary | null>(null);
  const [joinNo, setJoinNo] = useState('');
  const [editProfile, setEditProfile] = useState(false);
  const [filter, setFilter] = useState<'all' | 'waiting'>('all');

  useEffect(() => { refreshRooms(); startAmbient(); const t = setInterval(refreshRooms, 5000); return () => clearInterval(t); }, []);

  const tryJoin = async (room: RoomSummary | { no: number }, password?: string) => {
    sfx.click();
    const r = await joinRoom('id' in room ? { roomId: room.id, password } : { no: room.no, password });
    if (!r.ok) {
      if (r.error === 'PASSWORD_REQUIRED') {
        const found = 'id' in room ? room : rooms.value.find((x) => x.no === room.no);
        if (found) setPwFor(found);
        return r;
      }
      toast(r.error, 'error'); sfx.error();
    } else { sfx.door(); }
    return r;
  };

  const list = rooms.value.filter((r) => filter === 'all' || r.status === 'waiting');
  const contents = modules.value.flatMap((m) => m.contents.map((c) => ({ ...c, moduleName: m.name })));

  return (
    <div class="lobby-screen">
      <div class="title-bg dim" />
      <div class="fog f1" />
      <header class="lobby-head">
        <div class="brand pixel">🕯️ 심야 테이블 <span class="faint">· 라운지</span></div>
        <button class="profile-chip" onClick={() => setEditProfile(true)} title="프로필 편집">
          {me.value && <AvatarPreview look={me.value.look} size={2} />}
          <span class="pixel">{me.value?.nickname}</span>
          <span class="faint small">편집</span>
        </button>
      </header>
      <main class="lobby-main">
        <section class="panel board">
          <div class="board-head">
            <h2 class="pixel">열려 있는 테이블</h2>
            <div class="row">
              <button class={`chip ${filter === 'all' ? 'gold' : ''}`} onClick={() => setFilter('all')}>전체</button>
              <button class={`chip ${filter === 'waiting' ? 'gold' : ''}`} onClick={() => setFilter('waiting')}>대기 중만</button>
            </div>
          </div>
          <div class="room-grid">
            {list.length === 0 && (
              <div class="empty">
                <p class="serif">아직 불이 켜진 테이블이 없습니다.</p>
                <button class="btn gold" onClick={() => setCreating(true)}>첫 방 만들기</button>
              </div>
            )}
            {list.map((r, i) => (
              <button key={r.id} class={`room-card ${r.status}`} style={{ '--tilt': `${((i * 37) % 5) - 2}deg` } as any} onClick={() => tryJoin(r)}>
                <div class="pin" />
                <div class="room-no mono">No.{String(r.no).padStart(3, '0')}</div>
                <div class="room-title">{r.title}</div>
                <div class="room-game serif">{r.contentTitle ? `「${r.contentTitle}」` : '게임 고르는 중'}</div>
                <div class="room-meta">
                  <span class={`chip ${r.status === 'playing' ? 'red' : 'green'}`}>{r.status === 'playing' ? '진행 중' : '대기 중'}</span>
                  <span class="chip">👤 {r.members}/{r.maxMembers}</span>
                  {r.hasPassword && <span class="chip gold">🔒 비밀방</span>}
                </div>
              </button>
            ))}
          </div>
        </section>
        <aside class="lobby-side">
          <div class="panel side-card">
            <button class="btn gold lg" style={{ width: '100%' }} onClick={() => { setCreating(true); sfx.click(); }}>＋ 방 만들기</button>
            <form class="row" style={{ marginTop: 12 }} onSubmit={(e) => { e.preventDefault(); const n = Number(joinNo); if (n) tryJoin({ no: n }); }}>
              <input class="input grow" inputMode="numeric" placeholder="방 번호" value={joinNo} onInput={(e) => setJoinNo((e.target as HTMLInputElement).value.replace(/\D/g, ''))} />
              <button class="btn" type="submit">입장</button>
            </form>
          </div>
          <div class="panel side-card">
            <h3 class="pixel">준비된 이야기</h3>
            {contents.length === 0 && <p class="faint small">등록된 시나리오가 없습니다.</p>}
            {contents.map((c) => (
              <div class="scenario-mini" key={c.contentId}>
                {c.cover && <img src={c.cover} alt="" />}
                <div>
                  <div class="serif strong">{c.title}</div>
                  <div class="faint small">{c.moduleName} · {c.minPlayers === c.maxPlayers ? `${c.minPlayers}인` : `${c.minPlayers}~${c.maxPlayers}인`} · 약 {c.playtimeMin}분</div>
                </div>
              </div>
            ))}
          </div>
          <div class="panel side-card small dim">
            <b class="pixel">조작법</b>
            <ul class="help">
              <li><kbd>W A S D</kbd> / 방향키 · 클릭으로 이동</li>
              <li><kbd>E</kbd> 의자에 앉기 · <kbd>Enter</kbd> 채팅</li>
              <li>밀담 구역 안의 대화는 구역 밖에서 들리지 않아요</li>
            </ul>
          </div>
        </aside>
      </main>

      {creating && <CreateRoom onClose={() => setCreating(false)} onCreated={(id, pw) => { setCreating(false); tryJoin({ id } as RoomSummary, pw); }} />}
      {pwFor && <PasswordPrompt room={pwFor} onClose={() => setPwFor(null)} onSubmit={async (pw) => { const r = await tryJoin(pwFor, pw); if (r.ok) setPwFor(null); }} />}
      {editProfile && <ProfileEditor onClose={() => setEditProfile(false)} />}
    </div>
  );
}

function CreateRoom(props: { onClose: () => void; onCreated: (id: string, password: string) => void }) {
  const [title, setTitle] = useState(`${me.value?.nickname ?? ''}의 테이블`.slice(0, LIMITS.roomTitleMax));
  const [password, setPassword] = useState('');
  const [max, setMax] = useState(8);
  const [err, setErr] = useState('');
  const submit = async (e: Event) => {
    e.preventDefault();
    const r = await call('rooms:create', { title, password, maxMembers: max });
    if (!r.ok) { setErr(r.error); sfx.error(); return; }
    props.onCreated(r.roomId, password);
  };
  return (
    <Modal title="새 테이블 열기" onClose={props.onClose}>
      <form class="col" style={{ gap: 14 }} onSubmit={submit}>
        <div class="field"><label>방 제목</label><input class="input" maxLength={LIMITS.roomTitleMax} value={title} onInput={(e) => setTitle((e.target as HTMLInputElement).value)} autoFocus /></div>
        <div class="field"><label>비밀번호 (선택)</label><input class="input" type="password" maxLength={20} value={password} placeholder="비워 두면 누구나 입장" onInput={(e) => setPassword((e.target as HTMLInputElement).value)} /></div>
        <div class="field"><label>최대 인원 (관전 포함) — {max}명</label><input type="range" min={2} max={LIMITS.maxMembersCap} value={max} onInput={(e) => setMax(Number((e.target as HTMLInputElement).value))} /></div>
        {err && <div class="form-error">{err}</div>}
        <div class="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" class="btn ghost" onClick={props.onClose}>취소</button>
          <button type="submit" class="btn gold">방 만들기</button>
        </div>
      </form>
    </Modal>
  );
}

function PasswordPrompt(props: { room: RoomSummary; onClose: () => void; onSubmit: (pw: string) => void }) {
  const [pw, setPw] = useState('');
  return (
    <Modal title={`🔒 No.${props.room.no} ${props.room.title}`} onClose={props.onClose}>
      <form class="col" style={{ gap: 14 }} onSubmit={(e) => { e.preventDefault(); props.onSubmit(pw); }}>
        <p class="dim small" style={{ margin: 0 }}>비밀번호가 걸린 방입니다.</p>
        <input class="input" type="password" autoFocus value={pw} placeholder="비밀번호" onInput={(e) => setPw((e.target as HTMLInputElement).value)} />
        <div class="row" style={{ justifyContent: 'flex-end' }}>
          <button type="button" class="btn ghost" onClick={props.onClose}>취소</button>
          <button type="submit" class="btn gold">입장</button>
        </div>
      </form>
    </Modal>
  );
}

export function ProfileEditor(props: { onClose: () => void }) {
  const [look, setLook] = useState(me.value!.look);
  const [nickname, setNickname] = useState(me.value!.nickname);
  const save = async () => {
    const r = await call('profile:update', { nickname, look });
    if (!r.ok) { toast(r.error, 'error'); return; }
    me.value = { ...me.value!, nickname, look };
    storage.setPref('lastNickname', nickname); storage.setPref('lastLook', look);
    sfx.chime();
    props.onClose();
  };
  return (
    <Modal title="내 모습 꾸미기" onClose={props.onClose} width={520}>
      <div class="col" style={{ gap: 14 }}>
        <AvatarEditor look={look} onChange={setLook} />
        <div class="field"><label>닉네임</label><input class="input" maxLength={LIMITS.nicknameMax} value={nickname} onInput={(e) => setNickname((e.target as HTMLInputElement).value)} /></div>
        <div class="row" style={{ justifyContent: 'space-between' }}>
          <button class="btn ghost sm" onClick={() => { storage.token = null; socket.disconnect(); screen.value = 'title'; setTimeout(() => socket.connect(), 50); }}>다른 이름으로 새로 시작</button>
          <div class="row">
            <button class="btn ghost" onClick={props.onClose}>취소</button>
            <button class="btn gold" onClick={save}>저장</button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
