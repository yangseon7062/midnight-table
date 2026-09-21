import type { CBView } from '@shared/cb/view';
import { PhaseCharacter } from './PhaseCharacter';
import { PhaseSelect } from './PhaseSelect';
import { PhaseBattle } from './PhaseBattle';
import { view } from './util';

/**
 * 카드 대전 모듈 진입점.
 * 한 판은 화면 세 장으로 돈다 — ⓪ 은 판마다 한 번, ①② 는 턴마다 반복 (기준서 1-2).
 */
export function CBGame(_props: { engine: { tableItems: number; inputBlocked: () => boolean } | null }) {
  const v = view();
  if (!v) return null;

  return (
    <div class="cb-root">
      {(v.phase === 'charSelect' || v.phase === 'charReveal') && <PhaseCharacter v={v} />}
      {v.phase === 'selecting' && <PhaseSelect v={v} />}
      {(v.phase === 'resolving' || (v.phase === 'finished' && v.revealed.length > 0)) && <PhaseBattle v={v} />}
      {v.phase === 'finished' && <Result v={v} />}
      {v.spectator && <div class="cb-spectator">관전 중 — 공개된 것만 보입니다</div>}
    </div>
  );
}

function Result({ v }: { v: CBView }) {
  if (!v.result) return null;
  const mine = v.me?.side;
  const { winner, reason } = v.result;
  const head = winner === 'draw' ? '무승부' : mine ? (winner === mine ? '승리' : '패배') : `${winner.toUpperCase()} 승리`;
  const why =
    reason === 'hp' ? '체력 소진'
    : reason === 'turnLimit' ? `${v.turnLimit}턴 종료 — 체력 비율 판정`
    : reason === 'autoPick' ? '자동 선택 3연속'
    : '기권';
  const ratio = (p: typeof v.p1) => (p.maxHp ? Math.round((p.hp / p.maxHp) * 100) : 0);

  return (
    <div class="cb-result">
      <div class="cb-result-card">
        <b class={winner === 'draw' ? 'draw' : mine && winner === mine ? 'win' : 'lose'}>{head}</b>
        <div class="cb-dim">{why}</div>
        {reason === 'turnLimit' && (
          <div class="cb-result-ratio">
            <span>{v.p1.characterId?.toUpperCase()} {v.p1.hp}/{v.p1.maxHp} ({ratio(v.p1)}%)</span>
            <span>{v.p2.characterId?.toUpperCase()} {v.p2.hp}/{v.p2.maxHp} ({ratio(v.p2)}%)</span>
          </div>
        )}
        <div class="cb-dim">곧 방으로 돌아갑니다</div>
      </div>
    </div>
  );
}
