import { useEffect, useState } from 'preact/hooks';
import { call, me, members, membersVersion, modules, refreshRooms, serverNow, table, toast } from '../net/net';
import { sfx } from '../audio/sfx';
import { AvatarPreview, Portal } from './common';

/** 로비 레이어의 테이블: 게임(모듈+콘텐츠) 선택, 준비, 자동 시작 카운트다운. 장르 중립. */
export function TablePanel() {
  membersVersion.value;
  const t = table.value;
  const myId = me.value?.userId;
  const mine = myId ? members.get(myId) : null;
  const seated = [...members.values()].filter((m) => m.seat?.tableId === t?.tableId && m.connected).sort((a, b) => a.seat!.index - b.seat!.index);
  const [browsing, setBrowsing] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { refreshRooms(); }, []);
  useEffect(() => {
    if (!t?.startsAt) return;
    const i = setInterval(() => { tick((x) => x + 1); }, 200);
    return () => clearInterval(i);
  }, [t?.startsAt]);
  useEffect(() => { if (t?.startsAt) sfx.bell(); }, [t?.startsAt]);

  if (!t) return null;
  const isSeated = !!mine?.seat;
  const contents = modules.value.flatMap((m) => m.contents.map((c) => ({ ...c, moduleName: m.name })));
  const selected = contents.find((c) => c.contentId === t.contentId && c.moduleId === t.moduleId);
  const meReady = !!myId && t.ready.includes(myId);
  const need = t.minPlayers ? t.minPlayers - seated.length : 0;
  const over = t.maxPlayers ? seated.length - t.maxPlayers : 0;
  const countdown = t.startsAt ? Math.max(0, Math.ceil((t.startsAt - serverNow()) / 1000)) : null;

  if (!isSeated) {
    return (
      <div class="table-hint panel">
        <span class="pixel">🪑 중앙 테이블의 의자에 앉으면 함께 할 게임을 고를 수 있어요</span>
        {selected && <span class="chip gold">지금 테이블 위: 「{selected.title}」 · 앉은 사람 {seated.length}/{selected.maxPlayers}</span>}
      </div>
    );
  }

  const choose = async (moduleId: string, contentId: string) => {
    const r = await call('table:select', { moduleId, contentId });
    if (!r.ok) { toast(r.error, 'warn'); sfx.error(); return; }
    sfx.thud(); setBrowsing(false);
  };
  const ready = async (v: boolean) => {
    const r = await call('table:ready', { ready: v });
    if (!r.ok) { toast(r.error, 'warn'); sfx.error(); return; }
    v ? sfx.stamp() : sfx.click();
  };

  let status = '';
  if (!selected) status = '게임 상자를 골라 테이블에 올려 주세요';
  else if (need > 0) status = `${need}명이 더 앉아야 시작할 수 있어요 (${selected.minPlayers === selected.maxPlayers ? `${selected.minPlayers}인 전용` : `${selected.minPlayers}~${selected.maxPlayers}인`})`;
  else if (over > 0) status = `인원이 ${over}명 많아요. 최대 ${selected.maxPlayers}명까지 앉을 수 있어요`;
  else if (t.ready.length < seated.length) status = `모두 준비하면 자동으로 시작합니다 (${t.ready.length}/${seated.length})`;
  else status = '곧 시작합니다!';

  return (
    <div class="table-panel panel">
      <div class="table-seats">
        {seated.map((m) => (
          <div key={m.userId} class={`seat ${t.ready.includes(m.userId) ? 'ready' : ''}`}>
            <AvatarPreview look={m.look} size={2} />
            <span class="pixel tiny">{m.nickname}</span>
            <span class="lamp" />
          </div>
        ))}
        {selected && Array.from({ length: Math.max(0, selected.maxPlayers - seated.length) }).map((_, i) => <div key={`e${i}`} class="seat empty"><span class="pixel tiny faint">빈 자리</span></div>)}
      </div>

      {selected ? (
        <div class="game-box open" onClick={() => setBrowsing(true)}>
          {selected.cover && <img src={selected.cover} alt="" />}
          <div class="box-info">
            <span class="chip">{selected.moduleName}</span>
            <h3 class="serif">{selected.title}</h3>
            <p class="serif dim">{selected.subtitle}</p>
            <div class="row small"><span class="chip gold">👥 {selected.minPlayers === selected.maxPlayers ? `${selected.minPlayers}인` : `${selected.minPlayers}~${selected.maxPlayers}인`}</span><span class="chip">⏳ 약 {selected.playtimeMin}분</span></div>
            <button class="btn sm ghost">다른 게임 고르기</button>
          </div>
        </div>
      ) : (
        <button class="game-box closed" onClick={() => { setBrowsing(true); sfx.cardSlide(); }}>
          <span class="pixel">＋ 게임 상자 고르기</span>
        </button>
      )}

      <div class="table-status">
        <span class="pixel small">{status}</span>
        <button class={`btn ${meReady ? '' : 'gold'} lg`} disabled={!selected} onClick={() => ready(!meReady)}>{meReady ? '준비 취소' : '준비 완료'}</button>
      </div>

      {countdown !== null && (
        <Portal><div class="countdown">
          <div class="pixel">게임 시작까지</div>
          <div class="num" key={countdown}>{countdown}</div>
          <div class="faint small">준비를 취소하면 멈춥니다</div>
        </div></Portal>
      )}

      {browsing && (
        <Portal><div class="shelf-back" onPointerDown={(e) => { if (e.target === e.currentTarget) setBrowsing(false); }}>
          <div class="shelf panel">
            <h3 class="pixel">게임 선반</h3>
            <div class="shelf-list">
              {contents.length === 0 && <p class="dim">등록된 게임이 없습니다. 운영자가 시나리오 에디터에서 추가할 수 있어요.</p>}
              {contents.map((c) => (
                <div key={`${c.moduleId}/${c.contentId}`} class={`shelf-item ${c.contentId === t.contentId ? 'on' : ''}`}>
                  {c.cover ? <img src={c.cover} alt="" /> : <div class="cover-ph serif">{c.title[0]}</div>}
                  <div class="grow col" style={{ gap: 6 }}>
                    <div class="row"><span class="chip">{c.moduleName}</span>{c.tags?.map((tg) => <span key={tg} class="chip">{tg}</span>)}</div>
                    <h4 class="serif">{c.title}</h4>
                    <p class="serif dim small">{c.summary}</p>
                    <div class="row small"><span class="chip gold">👥 {c.minPlayers === c.maxPlayers ? `${c.minPlayers}인` : `${c.minPlayers}~${c.maxPlayers}인`}</span><span class="chip">⏳ 약 {c.playtimeMin}분</span></div>
                  </div>
                  <button class="btn gold" onClick={() => choose(c.moduleId, c.contentId)}>테이블에 올리기</button>
                </div>
              ))}
            </div>
            <div class="row" style={{ justifyContent: 'flex-end' }}><button class="btn ghost" onClick={() => setBrowsing(false)}>닫기</button></div>
          </div>
        </div></Portal>
      )}
    </div>
  );
}
