import { useState } from 'preact/hooks';
import { randomLook } from '@shared/avatar';
import { LIMITS } from '@shared/platform';
import { AvatarEditor } from './AvatarEditor';
import { authenticate, refreshRooms, screen, storage } from '../net/net';
import { sfx, startAmbient } from '../audio/sfx';

export function Title() {
  const [nickname, setNickname] = useState(storage.getPref('lastNickname', ''));
  const [look, setLook] = useState(storage.getPref('lastLook', randomLook()));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const enter = async (e?: Event) => {
    e?.preventDefault();
    const n = nickname.trim();
    if (!n) { setError('닉네임을 입력해 주세요'); sfx.error(); return; }
    setBusy(true);
    storage.setPref('lastNickname', n); storage.setPref('lastLook', look);
    const r = await authenticate(n, look);
    setBusy(false);
    if (!r.ok) { setError(r.error); sfx.error(); return; }
    sfx.bell(); startAmbient();
    screen.value = 'lobby';
    refreshRooms();
  };

  return (
    <div class="title-screen">
      <div class="title-bg" />
      <div class="fog f1" /><div class="fog f2" />
      <div class="title-inner">
        <div class="logo">
          <div class="logo-glass" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="64" height="64"><path d="M22 10h20l-4 20q-6 7-12 0z" fill="#7a1f24" stroke="#e8dcc0" stroke-width="2.5" /><path d="M32 34v16m-9 2h18" stroke="#e8dcc0" stroke-width="2.5" fill="none" /></svg>
          </div>
          <h1>심야 테이블</h1>
          <p class="serif">모여 앉아, 속삭이고, 의심하라.</p>
        </div>
        <form class="panel title-card" onSubmit={enter}>
          <AvatarEditor look={look} onChange={setLook} />
          <div class="field">
            <label for="nick">닉네임</label>
            <input id="nick" class="input" maxLength={LIMITS.nicknameMax} value={nickname} placeholder="밤손님" autoFocus
              onInput={(e) => { setNickname((e.target as HTMLInputElement).value); setError(''); }} />
          </div>
          {error && <div class="form-error">{error}</div>}
          <button class="btn gold lg" type="submit" disabled={busy}>{busy ? '입장 중…' : '저택으로 들어가기'}</button>
          <p class="faint small">회원가입이 없습니다. 이 브라우저에 입장 정보가 저장되어 새로고침해도 이어서 플레이할 수 있어요.</p>
        </form>
      </div>
    </div>
  );
}
