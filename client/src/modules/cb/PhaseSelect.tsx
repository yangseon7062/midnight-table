import { useMemo, useState } from 'preact/hooks';
import type { CBCardInfo, CBView } from '@shared/cb/view';
import type { Pos } from '@shared/cb/types';
import { RangeMini } from './CardArt';
import { Board, CardTile, Hud } from './parts';
import { act, cardEffect, cardLabel, cardMap, energyAfter, rangeCells, secondsLeft, slotCode, sortHand, useNow } from './util';

/**
 * ① 카드 선택 화면 (기준서 1-2 ①). 패가 주인공이다.
 *
 * - 가운데 왼쪽에 보드를 작게. 카드에 손을 올리면 그 카드가 닿는 칸을 보드에 표시한다.
 * - 가운데 오른쪽에 고른 순서 1 › 2 › 3 과 확정.
 * - 아래에 손패 14장을 세 줄로 — 이동 6 / 방어·보조 4 / 기술 4.
 * - 기력 바에는 고른 카드가 쓸 만큼을 금색 빗금으로 미리 보여준다.
 */
export function PhaseSelect({ v }: { v: CBView }) {
  const now = useNow();
  const left = secondsLeft(v.deadline, now);
  const me = v.me;
  const mine = me ? (me.side === 'p1' ? v.p1 : v.p2) : null;
  const cards = useMemo(() => cardMap(v), [v.cards]);
  const [picked, setPicked] = useState<string[]>([]);
  const [hover, setHover] = useState<string | null>(null);

  const submitted = !!me?.submission;
  const hand = useMemo(() => sortHand(me?.hand ?? []), [me?.hand]);
  const rows: [string, CBCardInfo[]][] = useMemo(() => {
    const by = (t: CBCardInfo['type']) => hand.map((id) => cards.get(id)).filter((c): c is CBCardInfo => !!c && c.type === t);
    return [['이동', by('move')], ['방어·보조', by('support')], ['기술', by('attack')]];
  }, [hand, cards]);

  const enNow = mine?.en ?? 0;
  const maxEn = mine?.maxEn ?? 0;
  const enLeft = energyAfter(picked, cards, enNow, maxEn);
  const spend = enNow - enLeft;

  // 손 올린 카드가 닿는 칸 — 공격 카드만. 내 현재 칸이 기준이다.
  const highlight: Pos[] = useMemo(() => {
    const info = hover ? cards.get(hover) : null;
    if (!info?.range || !mine) return [];
    return rangeCells(mine.pos, info.range);
  }, [hover, cards, mine?.pos.row, mine?.pos.col]);

  const canAfford = (id: string): boolean => {
    if (picked.includes(id)) return true;
    const info = cards.get(id);
    if (!info) return false;
    return info.energyCost <= enLeft;
  };

  const toggle = (id: string) => {
    setPicked((cur) => {
      if (cur.includes(id)) return cur.filter((c) => c !== id);
      if (cur.length >= 3) return cur;
      return [...cur, id];
    });
  };

  const hoverInfo = hover ? cards.get(hover) : null;

  return (
    <div class="cb-game cb-phase-select">
      <Hud
        v={v}
        pendingEn={picked.length ? enLeft : undefined}
        center={
          <div class="cb-center-big">
            <div class="cb-center-l">남은 시간</div>
            <b class={left !== null && left <= 5 ? 'urgent' : ''}>{left ?? '—'}</b>
            <div class="cb-center-s">제한 20초</div>
          </div>
        }
      />

      <div class="cb-select-mid">
        <section class="cb-panel cb-boardwrap">
          <header class="cb-panel-h">
            <span>보드 4 × 3</span>
            <span class={highlight.length ? 'cb-hl' : 'cb-dim'}>
              {highlight.length ? `빗금 = ${cardLabel(hover!, cards)} 가 닿는 칸` : '카드에 손을 올리면 닿는 칸이 보인다'}
            </span>
          </header>
          <Board v={v} highlight={highlight} />
          <footer class="cb-dim between">
            <span>내 칸도 범위에 들지만 나는 안 맞는다</span>
            <span>20턴까지 결판이 안 나면 HP 비율 판정</span>
          </footer>
        </section>

        <section class="cb-panel cb-orderpanel">
          <header class="cb-panel-h">
            <span>고른 순서</span>
            <span class="cb-count">{picked.length} / 3</span>
          </header>
          <div class="cb-slots">
            {[0, 1, 2].map((i) => {
              const id = picked[i];
              const info = id ? cards.get(id) : undefined;
              return (
                <div key={i} class="cb-slot-wrap">
                  {i > 0 && <span class="cb-arrow" aria-hidden="true">›</span>}
                  <div class="cb-slot">
                    {info ? (
                      <>
                        <CardTile info={info} order={i + 1} onClick={() => toggle(id)} />
                        <div class="cb-slot-cap">
                          <b>{info.name}</b>
                          <span class="cb-dim">
                            {info.type === 'attack' ? `기력 ${info.energyCost} · ${info.damage} 피해` : `기력 ${info.energyCost}`}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div class="cb-slot-empty"><span>{i + 1}</span><em>{i === picked.length ? '한 장 더' : ''}</em></div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div class="cb-order-foot">
            <div class="cb-dim">
              {picked.length
                ? `쓸 기력 ${spend} · 남을 기력 ${enLeft}`
                : '같은 카드는 한 턴에 두 번 못 고른다. 제출하면 잠긴다.'}
            </div>
            <button
              type="button"
              class="cb-confirm"
              disabled={picked.length !== 3 || submitted}
              onClick={async () => { if (await act('submit', { cardIds: picked })) setPicked([]); }}
            >
              {submitted ? '제출 완료' : picked.length === 3 ? '확정' : '3장을 다 골라야 확정'}
            </button>
          </div>
        </section>
      </div>

      <section class="cb-panel cb-hand">
        <header class="cb-panel-h">
          <span>손패 14장</span>
          <span class="cb-dim">덱도 뽑기도 없다 — 매 턴 같은 14장</span>
        </header>
        {submitted ? (
          <div class="cb-waiting">제출했습니다. 상대를 기다리는 중…</div>
        ) : (
          <div class="cb-rows">
            {rows.map(([label, list]) => (
              <div key={label} class="cb-row">
                <div class="cb-row-l"><b>{label}</b><span>{list.length}</span></div>
                <div class="cb-row-tiles">
                  {list.map((info) => {
                    const ord = picked.indexOf(info.id);
                    return (
                      <CardTile
                        key={info.id}
                        info={info}
                        order={ord >= 0 ? ord + 1 : null}
                        locked={!canAfford(info.id)}
                        onClick={() => toggle(info.id)}
                        onEnter={() => setHover(info.id)}
                        onLeave={() => setHover((h) => (h === info.id ? null : h))}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {hoverInfo && !submitted && (
          <div class="cb-tip" role="tooltip">
            <div class="cb-tip-h">
              <b>{hoverInfo.name}</b>
              <span class="cb-slotcode">{slotCode(hoverInfo.id)}</span>
            </div>
            <div class="cb-tip-body">{cardEffect(hoverInfo)}</div>
            <div class="cb-tip-foot">
              {hoverInfo.range && <RangeMini pattern={hoverInfo.range} size={30} />}
              <span class="cb-cost inline">{hoverInfo.energyCost}</span>
              <span>기력 {hoverInfo.energyCost} 소모</span>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
