/**
 * 캐릭터 문장(紋章) 여덟 개.
 *
 * 얼굴이 아니라 **무기**를 그린다. 보드의 말은 30px 원형이고, 그 크기에서 눈·코·입은
 * 회색 점으로 뭉개져 여덟이 전부 같아 보인다. 무기는 무기 자체가 실루엣이라 작아져도
 * 형태가 남는다 — 그리고 이미 `data/characters.ts` 에 무기가 있으니 설정과도 안 어긋난다.
 *
 * 30px 에서 구별되는 것은 디테일이 아니라 **덩어리 모양**이므로, 여덟의 실루엣 축을
 * 일부러 갈라 두었다:
 *
 *   C1 대각선 · C2 네모 · C3 방패 · C4 갈고리 · C5 종 · C6 엑스 · C7 세로 · C8 덩어리
 *
 * 굵기나 장식으로 구별하려 들면 작은 크기에서 전부 무너진다. 축을 바꿔야 한다.
 *
 * 전부 24×24 좌표계에 `currentColor` 로 그린다 — 색은 쓰는 쪽(진영색 / 회색 / 주홍)이 정한다.
 * 외부 에셋을 쓰지 않는다는 프로젝트 규칙(PROJECT.md)에 따라 코드로만 그렸다.
 */

import type { ComponentChildren } from 'preact';

type Mark = { d: ComponentChildren; label: string };

const MARKS: Record<string, Mark> = {
  // 외날 장검 — 한 번 그은 선을 끝까지 밀고 간다
  c1: {
    label: '외날 장검',
    d: (
      <>
        <path d="M5.5 18.5 L17.5 6.5" stroke-width="2.6" />
        <path d="M17.5 6.5 L20.2 3.8" stroke-width="1.3" />
        <path d="M7.6 13.4 L12.6 18.4" stroke-width="2" />
        <circle cx="4.4" cy="19.6" r="1.4" fill="currentColor" stroke="none" />
      </>
    ),
  },
  // 부적과 먹줄 — 네모를 재고 건다
  c2: {
    label: '부적과 먹줄',
    d: (
      <>
        <rect x="8" y="3.5" width="8" height="14" stroke-width="1.8" />
        <path d="M3 20.5 L21 5.5" stroke-width="2" />
        <path d="M10.4 8 L13.6 8" stroke-width="1.2" />
        <path d="M10.4 11.2 L13.6 11.2" stroke-width="1.2" />
      </>
    ),
  },
  // 방패와 단창 — 물러설 자리를 먼저 없앤다
  c3: {
    label: '방패와 단창',
    d: (
      <>
        <path d="M12 4.6 L19 7 L19 13.4 Q19 19 12 21.6 Q5 19 5 13.4 L5 7 Z" stroke-width="1.9" />
        <path d="M12 0.6 L12 4.6" stroke-width="2.2" />
        <path d="M9.6 2.4 L14.4 2.4" stroke-width="1.3" />
      </>
    ),
  },
  // 갈고리 사슬 — 위로 낚아챈다
  c4: {
    label: '갈고리 사슬',
    d: (
      <>
        <path d="M16 3.6 L16 12.4 Q16 19.4 10 19.4 Q5.6 19.4 5.6 15.4" stroke-width="2.4" />
        <circle cx="19.4" cy="5" r="1.7" stroke-width="1.5" />
        <circle cx="21.4" cy="9.4" r="1.4" stroke-width="1.3" />
      </>
    ),
  },
  // 쇠방울 채찍 — 소리로 자리를 통째로 덮는다
  c5: {
    label: '쇠방울 채찍',
    d: (
      <>
        <path d="M8.5 5 Q8.5 3 12 3 Q15.5 3 15.5 5 L17 11 L7 11 Z" stroke-width="1.7" />
        <circle cx="12" cy="13.2" r="1.5" fill="currentColor" stroke="none" />
        <path d="M3.5 21 Q8 16.5 12 19 Q16 21.5 20.5 16.5" stroke-width="1.9" />
      </>
    ),
  },
  // 쌍단도 — 한 방이 없는 대신 멈추지 않는다
  c6: {
    label: '쌍단도',
    d: (
      <>
        <path d="M5 5.6 L18 18.4" stroke-width="2.4" />
        <path d="M19 5.6 L6 18.4" stroke-width="2.4" />
        <circle cx="19.4" cy="19.8" r="1.3" fill="currentColor" stroke="none" />
        <circle cx="4.6" cy="19.8" r="1.3" fill="currentColor" stroke="none" />
      </>
    ),
  },
  // 장창 — 한 줄로 세우고 한 번에 꿴다
  c7: {
    label: '장창',
    d: (
      <>
        <path d="M12 1.4 L15 8 L12 11.6 L9 8 Z" stroke-width="1.6" />
        <path d="M12 11.6 L12 22.6" stroke-width="2.4" />
        <path d="M9.4 14.6 L14.6 14.6" stroke-width="1.5" />
      </>
    ),
  },
  // 당목 철퇴 — 몸도 기력도 가장 두텁다
  c8: {
    label: '당목 철퇴',
    d: (
      <>
        <circle cx="16.4" cy="7" r="4.8" fill="currentColor" stroke="none" />
        <path d="M13.4 10.6 L4.6 20" stroke-width="3" />
        <path d="M7.5 13.6 L10.5 16.6" stroke-width="1.6" />
      </>
    ),
  },
};

/** 카드 id(`c7_c`)에서 주인을 찾는다. 뷰에 characterId 를 따로 싣지 않으려는 것이다. */
export function ownerOf(cardId: string): string | null {
  const m = /^(c\d)_[a-d]$/.exec(cardId);
  return m && m[1] in MARKS ? m[1] : null;
}

/**
 * 문장 하나. `size` 는 그려질 픽셀, 색은 `currentColor` 로 바깥에서 준다.
 * 모르는 캐릭터면 아무것도 그리지 않는다 — 자리표시를 만들지 않는 편이 낫다.
 */
export function CharMark({ characterId, size = 24 }: { characterId: string | null | undefined; size?: number }) {
  const mark = characterId ? MARKS[characterId] : undefined;
  if (!mark) return null;
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} class="cb-mark" aria-hidden="true">
      <g fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
        {mark.d}
      </g>
    </svg>
  );
}

/**
 * 기술 카드 면에 얹는 문장. 카드 그림은 40×40 좌표계라 24×24 를 가운데로 옮겨 키운다.
 * 사거리 격자가 뒤에 깔리므로 문장은 밝은 색으로 그 위에 온다.
 */
export function CardMark({ characterId, scale = 1.15 }: { characterId: string | null; scale?: number }) {
  const mark = characterId ? MARKS[characterId] : undefined;
  if (!mark) return null;
  const off = (40 - 24 * scale) / 2;
  return (
    <g
      transform={`translate(${off.toFixed(2)} ${off.toFixed(2)}) scale(${scale})`}
      fill="none"
      stroke="var(--cb-atk-hi)"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      {mark.d}
    </g>
  );
}

/** 무기 이름 — 접근성 라벨에 쓴다 */
export function weaponOf(characterId: string | null | undefined): string {
  return (characterId && MARKS[characterId]?.label) || '';
}
