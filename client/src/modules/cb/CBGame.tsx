import { useEffect, useState } from 'preact/hooks';
import type { CBView } from '@shared/cb/view';
import { BOARD_COLS, BOARD_ROWS } from '@shared/cb/types';
import { call, gameView, serverNow, toast } from '../../net/net';

/**
 * 카드 대전 UI — **2단계 임시 화면**.
 *
 * 지금 할 일은 "테이블에서 골라 세션이 시작되고, 규칙대로 한 판이 굴러가는가"를
 * 실제 브라우저에서 확인하는 것뿐이다. 기준서 1-2 의 ⓪ ① ② 세 화면은 3단계에서
 * PhaseCharacter / PhaseSelect / PhaseBattle 로 새로 만들고 이 파일은 진입점만 남긴다.
 * 그래서 여기서는 꾸미지 않는다 — 상태가 그대로 보이는 것이 목적이다.
 */

const view = () => gameView.value as CBView;

async function act(type: string, payload?: unknown): Promise<boolean> {
  const r = await call('g:action', { type, payload });
  if (!r.ok) toast(r.error, 'warn');
  return r.ok;
}

function useTick(ms = 250) {
  const [, setN] = useState(0);
  useEffect(() => { const t = setInterval(() => setN((n) => n + 1), ms); return () => clearInterval(t); }, [ms]);
}

const CHAR_IDS = ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8'];

export function CBGame(_props: { engine: { tableItems: number; inputBlocked: () => boolean } | null }) {
  const v = view();
  const [picked, setPicked] = useState<string[]>([]);
  useTick();

  useEffect(() => { if (v?.phase !== 'selecting') setPicked([]); }, [v?.phase, v?.turn]);
  if (!v) return null;

  const left = v.deadline > 0 ? Math.max(0, Math.ceil((v.deadline - serverNow()) / 1000)) : null;
  const me = v.me;
  const mine = me ? (me.side === 'p1' ? v.p1 : v.p2) : null;
  const foe = me ? (me.side === 'p1' ? v.p2 : v.p1) : null;

  const toggle = (id: string) => {
    setPicked((cur) => (cur.includes(id) ? cur.filter((c) => c !== id) : cur.length < 3 ? [...cur, id] : cur));
  };

  const side = (p: CBView['p1']) => (
    <div class="cb-side">
      <b>{p.characterId ? p.characterId.toUpperCase() : '???'}</b>
      <span> {p.nickname}{p.userId === null ? ' (AI)' : ''}</span>
      {p.maxHp > 0 && <span> · HP {p.hp}/{p.maxHp} · 기력 {p.en}/{p.maxEn}</span>}
      {!p.connected && <span> · 연결 끊김</span>}
      {v.phase === 'selecting' && <span> · {p.submitted ? '선택 완료' : '고르는 중'}</span>}
    </div>
  );

  const cells = [];
  for (let r = 0; r < BOARD_ROWS; r++) {
    for (let c = 0; c < BOARD_COLS; c++) {
      const here: string[] = [];
      if (v.p1.pos.row === r && v.p1.pos.col === c) here.push('1P');
      if (v.p2.pos.row === r && v.p2.pos.col === c) here.push('2P');
      cells.push(<div class="cb-cell" key={`${r}-${c}`}>{here.join(' + ')}</div>);
    }
  }

  return (
    <div class="cb-game">
      <div class="cb-hud">
        <span>턴 {v.turn} / {v.turnLimit}</span>
        {left !== null && <span> · 남은 시간 {left}초</span>}
        <span> · {v.phase}</span>
        {v.spectator && <span> · 관전 중</span>}
      </div>

      {side(v.p1)}
      {side(v.p2)}

      <div class="cb-board" style={{ display: 'grid', gridTemplateColumns: `repeat(${BOARD_COLS}, 1fr)`, gap: 4 }}>
        {cells}
      </div>

      {v.phase === 'charSelect' && me && !mine?.charLocked && (
        <div class="cb-chars">
          <div>캐릭터를 고르세요</div>
          {CHAR_IDS.map((id) => (
            <button key={id} onClick={() => act('chooseChar', { characterId: id })}>{id.toUpperCase()}</button>
          ))}
        </div>
      )}
      {v.phase === 'charSelect' && mine?.charLocked && <div>확정했습니다. 상대를 기다리는 중…</div>}
      {v.phase === 'charReveal' && <div>캐릭터 공개 — 곧 시작합니다</div>}

      {v.phase === 'selecting' && me && !me.submission && (
        <div class="cb-hand">
          <div>고른 순서: {picked.length ? picked.join(' › ') : '아직 없음'}</div>
          {me.hand.map((id) => (
            <button
              key={id}
              disabled={!me.affordable.includes(id) && !picked.includes(id)}
              onClick={() => toggle(id)}
            >
              {picked.includes(id) ? `${picked.indexOf(id) + 1}. ` : ''}{id}
            </button>
          ))}
          <button
            disabled={picked.length !== 3}
            onClick={async () => { if (await act('submit', { cardIds: picked })) setPicked([]); }}
          >
            {picked.length === 3 ? '확정' : '3장을 다 골라야 확정'}
          </button>
        </div>
      )}
      {v.phase === 'selecting' && me?.submission && <div>제출 완료 — 상대를 기다리는 중…</div>}

      {v.revealed.length > 0 && (
        <div class="cb-reveal">
          {v.revealed.map((slot) => (
            <div key={slot.slot}>
              <b>슬롯 {slot.slot + 1}</b> — 1P {slot.cards.p1} / 2P {slot.cards.p2}
              <ul>
                {slot.steps.map((s, i) => (
                  <li key={i}>
                    {s.side} {s.kind === 'attack'
                      ? `${s.cardId} ${s.hit ? `명중 ${s.raw}${s.reduced ? ` − ${s.reduced}` : ''} = ${s.dealt}` : 'MISS'}`
                      : s.kind === 'move' ? `${s.cardId} → (${s.to.row},${s.to.col})${s.blocked ? ' (막힘)' : ''}`
                      : s.kind === 'guard' ? `${s.cardId} 방어`
                      : s.kind === 'energy' ? `기력 +${s.gained}`
                      : s.kind === 'heal' ? `체력 +${s.healed}`
                      : `${s.cardId} 불발 (기력 부족)`}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {v.result && (
        <div class="cb-result">
          <b>{v.result.winner === 'draw' ? '무승부' : `${v.result.winner.toUpperCase()} 승리`}</b>
          <span> ({v.result.reason})</span>
        </div>
      )}
      {!me && <div>관전 중 — 공개된 것만 보입니다</div>}
      {foe && null}
    </div>
  );
}
