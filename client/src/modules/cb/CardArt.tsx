import type { CBCardInfo } from '@shared/cb/view';
import { CardMark, ownerOf } from './marks';

/**
 * 카드 면 그림 (기준서 1-1: 카드에는 **그림만**).
 *
 * 기술 카드의 그림은 그 카드의 사거리 패턴에서 만든다 — 이름이 아직 없어도
 * 카드마다 생김새가 갈리고, 무엇보다 그림 자체가 "어디에 닿는가"를 말해 준다.
 * 이름이 정해지면 이 그림 위에 고유 도상을 얹거나 갈아 끼우면 된다.
 */
export function CardArt({ info, size = 44 }: { info: CBCardInfo | undefined; size?: number }) {
  if (!info) return null;
  const s = { width: size, height: size } as const;

  if (info.type === 'move') {
    const { dr, dc, steps } = info.move ?? { dr: 0, dc: 1, steps: 1 };
    const rot = dr < 0 ? -90 : dr > 0 ? 90 : dc < 0 ? 180 : 0;
    return (
      <svg viewBox="0 0 40 40" style={s} role="img" aria-label="이동">
        <g transform={`rotate(${rot} 20 20)`}>
          <path d="M6 20 L26 20" stroke="var(--cb-move)" stroke-width="4" stroke-linecap="square" />
          <path d="M22 11 L31 20 L22 29 Z" fill="var(--cb-move-hi)" />
          {steps > 1 && <path d="M28 11 L37 20 L28 29 Z" fill="var(--cb-move)" />}
        </g>
      </svg>
    );
  }

  if (info.id === 'guard' || info.id === 'perfect_guard') {
    return (
      <svg viewBox="0 0 40 40" style={s} role="img" aria-label="방어">
        <path d="M20 4 L34 9 L34 21 Q34 32 20 37 Q6 32 6 21 L6 9 Z" fill="var(--cb-support-dim)" stroke="var(--cb-support-hi)" stroke-width="2.4" stroke-linejoin="round" />
        {info.id === 'perfect_guard' && (
          <path d="M20 10 L28 13 L28 21 Q28 28 20 31 Q12 28 12 21 L12 13 Z" fill="none" stroke="var(--cb-support-hi)" stroke-width="1.8" stroke-linejoin="round" />
        )}
      </svg>
    );
  }

  if (info.id === 'energy_up') {
    return (
      <svg viewBox="0 0 40 40" style={s} role="img" aria-label="기력 회복">
        <path d="M8 24 L20 6 L20 18 L32 18 L20 36 L20 24 Z" fill="var(--cb-en)" stroke="var(--cb-en-hi)" stroke-width="1.6" stroke-linejoin="round" />
      </svg>
    );
  }

  if (info.id === 'heal') {
    return (
      <svg viewBox="0 0 40 40" style={s} role="img" aria-label="체력 회복">
        <path d="M16 6 L24 6 L24 16 L34 16 L34 24 L24 24 L24 34 L16 34 L16 24 L6 24 L6 16 L16 16 Z" fill="var(--cb-support-hi)" />
      </svg>
    );
  }

  // 기술 — 사거리 격자를 바탕으로 깔고 그 위에 **그 캐릭터의 무기 문장**을 얹는다.
  //
  // 예전에는 여기에 일반적인 사선 하나를 그었는데, 그러면 한 캐릭터의 네 장이 전부
  // 똑같이 생기고 다른 캐릭터의 카드와도 구별이 안 됐다. 문장을 쓰면 사거리(뒤)와
  // 주인(앞)이 한 장에 같이 읽힌다. 카드 면에 이름을 안 적는다는 규칙(기준서 1-1)을
  // 지키면서 "누구의 무엇인가"를 그림만으로 말하는 방법이다.
  const p = info.range;
  const owner = ownerOf(info.id);
  return (
    <svg viewBox="0 0 40 40" style={s} role="img" aria-label="기술">
      {p?.map((row, r) =>
        row.map((on, c) =>
          on ? <rect key={`${r}-${c}`} x={4 + c * 11} y={4 + r * 11} width="10" height="10" fill="var(--cb-atk-dim)" /> : null,
        ),
      )}
      {owner ? (
        <CardMark characterId={owner} />
      ) : (
        // 주인을 모르는 공격 카드 — 지금 데이터에는 없지만, 생기면 예전 사선으로 떨어진다
        <>
          <path d="M5 32 Q20 22 35 7" stroke="var(--cb-atk-hi)" stroke-width="5" fill="none" stroke-linecap="round" />
          <path d="M7 35 Q22 26 37 11" stroke="var(--cb-atk)" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.8" />
        </>
      )}
    </svg>
  );
}

/** 말풍선 안에 넣는 3×3 사거리 미니맵. 가운데 칸이 내 자리다. */
export function RangeMini({ pattern, size = 34 }: { pattern: readonly (readonly number[])[]; size?: number }) {
  return (
    <div class="cb-rangemini" style={{ width: size }} role="img" aria-label="사거리">
      {pattern.map((row, r) =>
        row.map((on, c) => (
          <span key={`${r}-${c}`} class={`${on ? 'on' : ''} ${r === 1 && c === 1 ? 'self' : ''}`} />
        )),
      )}
    </div>
  );
}
