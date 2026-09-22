import { useState } from 'preact/hooks';
import type { CBView } from '@shared/cb/view';
import { CardArt, RangeMini } from './CardArt';
import { Hud } from './parts';
import { CharMark } from './marks';
import { Portrait } from './portraits';
import { act, secondsLeft, slotCode, useNow } from './util';

/**
 * ⓪ 캐릭터 선택 화면 (기준서 1-2 ⓪).
 * 판마다 한 번. 8명을 늘어놓고, 고르면 그 캐릭터의 HP / Max EN / 기술 4개를 옆에 보여준다.
 * 상대 쪽에는 "선택 완료" 여부만 뜨고, 둘 다 확정되면 동시에 공개된다.
 */
export function PhaseCharacter({ v }: { v: CBView }) {
  const now = useNow();
  const left = secondsLeft(v.deadline, now);
  const mine = v.me ? (v.me.side === 'p1' ? v.p1 : v.p2) : null;
  const [sel, setSel] = useState<string | null>(null);
  const picked = mine?.charLocked ? mine.characterId : sel;
  const detail = v.roster.find((c) => c.id === picked) ?? null;
  const locked = !!mine?.charLocked;

  return (
    <div class="cb-game cb-phase-char">
      <Hud
        v={v}
        center={
          v.phase === 'charReveal' ? (
            <div class="cb-center-big"><div class="cb-center-l">공개</div><b class="cb-reveal-word">대치</b></div>
          ) : (
            <div class="cb-center-big">
              <div class="cb-center-l">남은 시간</div>
              <b>{left ?? '—'}</b>
              <div class="cb-center-s">제한 30초 · 안 고르면 랜덤</div>
            </div>
          )
        }
      />

      <div class="cb-char-body">
        <section class="cb-panel cb-roster">
          <header class="cb-panel-h">
            <span>여덟 중 하나</span>
            <span class="cb-dim">같은 캐릭터끼리도 붙을 수 있다</span>
          </header>
          <div class="cb-roster-grid">
            {v.roster.map((c) => (
              <button
                key={c.id}
                type="button"
                class={`cb-char ${picked === c.id ? 'on' : ''}`}
                disabled={locked}
                onClick={() => setSel(c.id)}
              >
                <b class="cb-char-id">{c.label}</b>
                <span class="cb-char-mark" aria-hidden="true"><CharMark characterId={c.id} size={28} /></span>
                <span class="cb-char-name">{c.name}</span>
                <span class="cb-char-alias">「{c.alias}」</span>
                <span class="cb-char-note">{c.note}</span>
                <span class="cb-char-stat">HP {c.maxHp} · 기력 {c.maxEn}</span>
              </button>
            ))}
          </div>
          <footer class="cb-dim">여덟은 같은 패를 찬다. 실력을 가리는 자리에서는 서로를 벤다.</footer>
        </section>

        <section class="cb-panel cb-char-detail">
          {detail ? (
            <>
              <header class="cb-detail-h">
                <div class="cb-detail-who">
                  <span class="cb-detail-mark" aria-hidden="true"><Portrait characterId={detail.id} size={104} /></span>
                  <div>
                  <b class="cb-detail-id">{detail.name}</b>
                  <span class="cb-detail-alias">「{detail.alias}」</span>
                  <span class="cb-slotcode">{detail.label}</span>
                  <div class="cb-dim">{detail.weapon} · {detail.note}</div>
                  </div>
                </div>
                <div class="cb-detail-stat">
                  <div class="hp">HP {detail.maxHp}</div>
                  <div class="en">기력 {detail.maxEn}</div>
                </div>
              </header>
              <p class="cb-detail-intro">{detail.intro}</p>
              <div class="cb-panel-h">기술 네 장</div>
              <div class="cb-skills">
                {detail.skills.map((s) => (
                  <div key={s.id} class="cb-skill">
                    {s.range && <RangeMini pattern={s.range} />}
                    <div class="cb-skill-name">
                      <b>{s.name}</b>
                      <span class="cb-slotcode">{slotCode(s.id)}</span>
                    </div>
                    <div class="cb-skill-num">
                      <div class="dm">{s.damage}</div>
                      <div class="en">{s.energyCost}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div class="cb-legend">
                <span><i class="dm" /> 위 = 피해</span>
                <span><i class="en" /> 아래 = 기력</span>
                <span>가운데 칸 = 내 자리</span>
              </div>
            </>
          ) : (
            <div class="cb-empty">왼쪽에서 한 명을 골라 보세요</div>
          )}

          <div class="cb-detail-foot">
            {v.solo && !locked && (
              <div class="cb-diff">
                <span class="cb-dim">AI 난이도</span>
                {(['normal', 'hard'] as const).map((lv) => (
                  <button
                    key={lv}
                    type="button"
                    class={v.difficulty === lv ? 'on' : ''}
                    onClick={() => act('setDifficulty', { level: lv })}
                  >
                    {lv === 'normal' ? 'Normal' : 'Hard'}
                  </button>
                ))}
              </div>
            )}
            {locked ? (
              <div class="cb-locked-note">확정했습니다. 상대를 기다리는 중…</div>
            ) : (
              <button
                type="button"
                class="cb-confirm"
                disabled={!picked}
                onClick={() => picked && act('chooseChar', { characterId: picked })}
              >
                {picked ? `${detail?.name ?? ''} 으로 확정` : '캐릭터를 고르세요'}
              </button>
            )}
            <div class="cb-dim center">확정하면 못 바꾼다. 둘 다 확정되면 동시에 공개된다.</div>
          </div>
        </section>
      </div>
    </div>
  );
}

/** 기술 미니 카드 — 상세 패널에서 쓰지 않지만, 3단계 이후 재사용을 위해 열어 둔다 */
export function SkillArt({ id, v }: { id: string; v: CBView }) {
  return <CardArt info={v.cards.find((c) => c.id === id)} />;
}
