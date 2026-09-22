/**
 * 반신 초상 여덟 장.
 *
 * `marks.tsx` 의 문장은 30px 에서 서로 갈리려고 만든 **기호**다. 여기는 반대로
 * 크게 볼 자리(캐릭터 선택 상세, 상단 바)에 쓰는 **그림**이다. 둘은 역할이 다르니
 * 하나로 합치지 않는다 — 초상을 30px 로 줄이면 다시 회색 덩어리가 된다.
 *
 * 먹그림 풍으로 간다: 면은 몇 개의 톤으로 채우고 선은 얇게. 사실적인 얼굴을 흉내 내지
 * 않는 편이 코드로 그릴 때 의도한 그림처럼 보인다. 여덟을 가르는 것은 얼굴이 아니라
 * **머리 모양과 무기**다 — 작게 줄여도 그 둘은 남는다.
 *
 * 색은 CSS 변수로 뺐다(`--pt-*`). 밝은 자리(선택 화면)와 어두운 자리(상단 바)에서
 * 같은 그림이 다른 톤으로 앉아야 하기 때문이다.
 */

import type { ComponentChildren } from 'preact';

const PORTRAITS: Record<string, ComponentChildren> = {
  // 하진
  c1: (
    <>
      <path d="M74 150 L112 96" stroke="var(--pt-metal)" stroke-width="6" stroke-linecap="round" />
      <path d="M112 96 L117 89" stroke="var(--pt-metal)" stroke-width="3" stroke-linecap="round" />
      <path d="M79 137 L91 146" stroke="var(--pt-line)" stroke-width="4" stroke-linecap="round" />
      <path d="M50 74 L50 93 Q60 99 70 93 L70 74 Z" fill="var(--pt-skin)" />
      <path d="M17 150 Q19 105 50 93 Q60 101 70 93 Q101 105 103 150 Z" fill="var(--pt-cloth)" />
      <path d="M50 93 L60 109 L70 93" fill="none" stroke="var(--pt-line)" stroke-width="1.6" />
      <ellipse cx="60" cy="53" rx="21" ry="25" fill="var(--pt-skin)" />
      <path d="M38 55 Q36 26 60 24 Q84 26 82 55 L78 44 Q60 37 42 44 Z" fill="var(--pt-hair)" />
      <path d="M80 33 Q99 28 104 10 Q110 32 90 46 Z" fill="var(--pt-hair)" />
      <path d="M50 50 Q54 47.5 58 49.5" fill="none" stroke="var(--pt-line)" stroke-width="1.5" />
      <path d="M62 49.5 Q66 47.5 70 50" fill="none" stroke="var(--pt-line)" stroke-width="1.5" />
      <path d="M51 56 L57 56" stroke="var(--pt-line)" stroke-width="2.2" />
      <path d="M63 56 L69 56" stroke="var(--pt-line)" stroke-width="2.2" />
    </>
  ),
  // 소윤
  c2: (
    <>
      <rect x="86" y="100" width="17" height="25" rx="1" transform="rotate(11 94 112)" fill="var(--pt-paper)" stroke="var(--pt-line)" stroke-width="1.4" />
      <rect x="94" y="120" width="15" height="22" rx="1" transform="rotate(-9 101 131)" fill="var(--pt-paper)" stroke="var(--pt-line)" stroke-width="1.4" />
      <path d="M92 106 L98 106 M92 112 L98 112" stroke="var(--pt-line)" stroke-width="1.2" />
      <path d="M50 74 L50 93 Q60 99 70 93 L70 74 Z" fill="var(--pt-skin)" />
      <path d="M17 150 Q19 105 50 93 Q60 101 70 93 Q101 105 103 150 Z" fill="var(--pt-cloth)" />
      <path d="M50 93 L60 109 L70 93" fill="none" stroke="var(--pt-line)" stroke-width="1.6" />
      <ellipse cx="60" cy="53" rx="21" ry="25" fill="var(--pt-skin)" />
      <path d="M37 58 Q35 25 60 24 Q85 25 83 58 L79 45 Q60 38 41 45 Z" fill="var(--pt-hair)" />
      <path d="M38 48 Q30 92 34 128 L46 128 Q42 88 44 52 Z" fill="var(--pt-hair)" />
      <path d="M82 48 Q90 92 86 128 L74 128 Q78 88 76 52 Z" fill="var(--pt-hair)" />
      <path d="M50 50 Q54 47.5 58 49.5" fill="none" stroke="var(--pt-line)" stroke-width="1.5" />
      <path d="M62 49.5 Q66 47.5 70 50" fill="none" stroke="var(--pt-line)" stroke-width="1.5" />
      <path d="M51 56 L57 56" stroke="var(--pt-line)" stroke-width="2.2" />
      <path d="M63 56 L69 56" stroke="var(--pt-line)" stroke-width="2.2" />
    </>
  ),
  // 석우
  c3: (
    <>
      <path d="M4 150 Q1 112 24 101 Q47 112 44 150 Z" fill="var(--pt-cloth2)" stroke="var(--pt-line)" stroke-width="1.8" />
      <path d="M24 108 L24 144" stroke="var(--pt-metal)" stroke-width="3" />
      <path d="M108 150 L108 104" stroke="var(--pt-metal)" stroke-width="4" stroke-linecap="round" />
      <path d="M50 74 L50 93 Q60 99 70 93 L70 74 Z" fill="var(--pt-skin)" />
      <path d="M17 150 Q19 105 50 93 Q60 101 70 93 Q101 105 103 150 Z" fill="var(--pt-cloth)" />
      <path d="M50 93 L60 109 L70 93" fill="none" stroke="var(--pt-line)" stroke-width="1.6" />
      <ellipse cx="60" cy="53" rx="21" ry="25" fill="var(--pt-skin)" />
      <path d="M36 52 Q36 24 60 23 Q84 24 84 52 L79 43 Q60 36 41 43 Z" fill="var(--pt-hair)" />
      <path d="M33 44 L87 44 L87 53 L33 53 Z" fill="var(--pt-metal)" stroke="var(--pt-line)" stroke-width="1.4" />
      <path d="M53 23 Q60 10 67 23 Z" fill="var(--pt-metal)" stroke="var(--pt-line)" stroke-width="1.4" />
      <path d="M50 50 Q54 47.5 58 49.5" fill="none" stroke="var(--pt-line)" stroke-width="1.5" />
      <path d="M62 49.5 Q66 47.5 70 50" fill="none" stroke="var(--pt-line)" stroke-width="1.5" />
      <path d="M51 56 L57 56" stroke="var(--pt-line)" stroke-width="2.2" />
      <path d="M63 56 L69 56" stroke="var(--pt-line)" stroke-width="2.2" />
    </>
  ),
  // 탁오
  c4: (
    <>
      <path d="M112 100 Q114 126 96 132 Q82 136 80 150" fill="none" stroke="var(--pt-metal)" stroke-width="4.5" stroke-linecap="round" />
      <circle cx="108" cy="96" r="4.5" fill="none" stroke="var(--pt-metal)" stroke-width="2.6" />
      <circle cx="99" cy="90" r="3.6" fill="none" stroke="var(--pt-metal)" stroke-width="2.2" />
      <path d="M50 74 L50 93 Q60 99 70 93 L70 74 Z" fill="var(--pt-skin)" />
      <path d="M17 150 Q19 105 50 93 Q60 101 70 93 Q101 105 103 150 Z" fill="var(--pt-cloth)" />
      <path d="M50 93 L60 109 L70 93" fill="none" stroke="var(--pt-line)" stroke-width="1.6" />
      <ellipse cx="60" cy="53" rx="21" ry="25" fill="var(--pt-skin)" />
      <path d="M38 54 Q36 27 60 25 Q84 27 82 54 L76 44 Q60 38 44 44 Z" fill="var(--pt-hair)" />
      <path d="M40 34 L33 18 L47 30 L48 12 L58 28 L64 11 L70 29 L82 16 L78 34 Q60 27 40 34 Z" fill="var(--pt-hair)" />
      <path d="M50 50 Q54 47.5 58 49.5" fill="none" stroke="var(--pt-line)" stroke-width="1.5" />
      <path d="M62 49.5 Q66 47.5 70 50" fill="none" stroke="var(--pt-line)" stroke-width="1.5" />
      <path d="M51 56 L57 56" stroke="var(--pt-line)" stroke-width="2.2" />
      <path d="M63 56 L69 56" stroke="var(--pt-line)" stroke-width="2.2" />
    </>
  ),
  // 채령
  c5: (
    <>
      <path d="M72 150 Q96 134 92 114 Q89 100 104 96" fill="none" stroke="var(--pt-metal)" stroke-width="3.6" stroke-linecap="round" />
      <circle cx="106" cy="94" r="3" fill="var(--pt-metal)" />
      <path d="M50 74 L50 93 Q60 99 70 93 L70 74 Z" fill="var(--pt-skin)" />
      <path d="M17 150 Q19 105 50 93 Q60 101 70 93 Q101 105 103 150 Z" fill="var(--pt-cloth)" />
      <path d="M50 93 L60 109 L70 93" fill="none" stroke="var(--pt-line)" stroke-width="1.6" />
      <ellipse cx="60" cy="53" rx="21" ry="25" fill="var(--pt-skin)" />
      <path d="M37 56 Q35 25 60 24 Q85 25 83 56 L78 44 Q60 37 42 44 Z" fill="var(--pt-hair)" />
      <ellipse cx="60" cy="16" rx="15" ry="11" fill="var(--pt-hair)" />
      <path d="M78 26 Q86 24 87 17" fill="none" stroke="var(--pt-metal)" stroke-width="1.6" />
      <path d="M83 17 Q83 13 87 13 Q91 13 91 17 L93 23 L81 23 Z" fill="var(--pt-metal)" stroke="var(--pt-line)" stroke-width="1.2" />
      <path d="M50 50 Q54 47.5 58 49.5" fill="none" stroke="var(--pt-line)" stroke-width="1.5" />
      <path d="M62 49.5 Q66 47.5 70 50" fill="none" stroke="var(--pt-line)" stroke-width="1.5" />
      <path d="M51 56 L57 56" stroke="var(--pt-line)" stroke-width="2.2" />
      <path d="M63 56 L69 56" stroke="var(--pt-line)" stroke-width="2.2" />
    </>
  ),
  // 여울
  c6: (
    <>
      <path d="M76 148 L110 110" stroke="var(--pt-metal)" stroke-width="4.5" stroke-linecap="round" />
      <path d="M110 148 L76 110" stroke="var(--pt-metal)" stroke-width="4.5" stroke-linecap="round" />
      <circle cx="75" cy="149" r="2.6" fill="var(--pt-line)" />
      <circle cx="111" cy="149" r="2.6" fill="var(--pt-line)" />
      <path d="M50 74 L50 93 Q60 99 70 93 L70 74 Z" fill="var(--pt-skin)" />
      <path d="M17 150 Q19 105 50 93 Q60 101 70 93 Q101 105 103 150 Z" fill="var(--pt-cloth)" />
      <path d="M50 93 L60 109 L70 93" fill="none" stroke="var(--pt-line)" stroke-width="1.6" />
      <ellipse cx="60" cy="53" rx="21" ry="25" fill="var(--pt-skin)" />
      <path d="M40 52 Q39 29 60 27 Q81 29 80 52 L76 45 Q60 40 44 45 Z" fill="var(--pt-hair)" />
      <path d="M40 46 Q44 33 60 32 Q76 33 80 46 L80 40 Q60 34 40 40 Z" fill="var(--pt-hair)" />
      <path d="M50 50 Q54 47.5 58 49.5" fill="none" stroke="var(--pt-line)" stroke-width="1.5" />
      <path d="M62 49.5 Q66 47.5 70 50" fill="none" stroke="var(--pt-line)" stroke-width="1.5" />
      <path d="M51 56 L57 56" stroke="var(--pt-line)" stroke-width="2.2" />
      <path d="M63 56 L69 56" stroke="var(--pt-line)" stroke-width="2.2" />
    </>
  ),
  // 한서
  c7: (
    <>
      <path d="M104 150 L104 98" stroke="var(--pt-metal)" stroke-width="5" stroke-linecap="round" />
      <path d="M104 96 L110 82 L104 70 L98 82 Z" fill="var(--pt-metal)" stroke="var(--pt-line)" stroke-width="1.4" />
      <path d="M96 110 L112 110" stroke="var(--pt-line)" stroke-width="2.6" />
      <path d="M50 74 L50 93 Q60 99 70 93 L70 74 Z" fill="var(--pt-skin)" />
      <path d="M17 150 Q19 105 50 93 Q60 101 70 93 Q101 105 103 150 Z" fill="var(--pt-cloth)" />
      <path d="M50 93 L60 109 L70 93" fill="none" stroke="var(--pt-line)" stroke-width="1.6" />
      <ellipse cx="60" cy="53" rx="21" ry="25" fill="var(--pt-skin)" />
      <path d="M38 53 Q37 26 60 24 Q83 26 82 53 L77 43 Q60 37 43 43 Z" fill="var(--pt-hair)" />
      <path d="M50 26 Q60 8 70 26 Z" fill="var(--pt-hair)" />
      <path d="M53 14 Q60 5 67 14" fill="none" stroke="var(--pt-metal)" stroke-width="2.4" />
      <path d="M50 50 Q54 47.5 58 49.5" fill="none" stroke="var(--pt-line)" stroke-width="1.5" />
      <path d="M62 49.5 Q66 47.5 70 50" fill="none" stroke="var(--pt-line)" stroke-width="1.5" />
      <path d="M51 56 L57 56" stroke="var(--pt-line)" stroke-width="2.2" />
      <path d="M63 56 L69 56" stroke="var(--pt-line)" stroke-width="2.2" />
    </>
  ),
  // 무진
  c8: (
    <>
      <circle cx="100" cy="106" r="15" fill="var(--pt-metal)" stroke="var(--pt-line)" stroke-width="1.6" />
      <path d="M92 119 L72 148" stroke="var(--pt-line)" stroke-width="7" stroke-linecap="round" />
      <path d="M82 130 L90 138" stroke="var(--pt-metal)" stroke-width="3" />
      <path d="M50 74 L50 93 Q60 99 70 93 L70 74 Z" fill="var(--pt-skin)" />
      <path d="M17 150 Q19 105 50 93 Q60 101 70 93 Q101 105 103 150 Z" fill="var(--pt-cloth)" />
      <path d="M50 93 L60 109 L70 93" fill="none" stroke="var(--pt-line)" stroke-width="1.6" />
      <ellipse cx="60" cy="53" rx="21" ry="25" fill="var(--pt-skin)" />
      <path d="M39 50 Q38 27 60 26 Q82 27 81 50 L77 45 Q60 41 43 45 Z" fill="var(--pt-skin)" />
      <path d="M40 46 Q44 34 60 33 Q76 34 80 46" fill="none" stroke="var(--pt-line)" stroke-width="1.4" />
      <circle cx="52" cy="38" r="1.6" fill="var(--pt-line)" />
      <circle cx="60" cy="36" r="1.6" fill="var(--pt-line)" />
      <circle cx="68" cy="38" r="1.6" fill="var(--pt-line)" />
      <path d="M44 100 Q60 116 76 100" fill="none" stroke="var(--pt-metal)" stroke-width="2.2" stroke-dasharray="1 5" stroke-linecap="round" />
      <path d="M50 50 Q54 47.5 58 49.5" fill="none" stroke="var(--pt-line)" stroke-width="1.5" />
      <path d="M62 49.5 Q66 47.5 70 50" fill="none" stroke="var(--pt-line)" stroke-width="1.5" />
      <path d="M51 56 L57 56" stroke="var(--pt-line)" stroke-width="2.2" />
      <path d="M63 56 L69 56" stroke="var(--pt-line)" stroke-width="2.2" />
    </>
  ),
};

export function hasPortrait(characterId: string | null | undefined): boolean {
  return !!characterId && characterId in PORTRAITS;
}

/**
 * 초상 하나. `size` 는 세로 픽셀 — 가로는 비율(120:150)대로 따라간다.
 * 모르는 캐릭터면 아무것도 그리지 않는다.
 */
export function Portrait({ characterId, size = 150 }: { characterId: string | null | undefined; size?: number }) {
  const art = characterId ? PORTRAITS[characterId] : undefined;
  if (!art) return null;
  return (
    <svg
      viewBox="0 0 120 150"
      width={(size * 120) / 150}
      height={size}
      class="cb-portrait-svg"
      aria-hidden="true"
    >
      {art}
    </svg>
  );
}
