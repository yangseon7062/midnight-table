import { useEffect } from 'preact/hooks';
import { sfx } from '../../audio/sfx';
import { Portal } from '../../ui/common';

const TIPS: [string, string, string][] = [
  ['✉️', '봉투를 뜯어 읽기', '자료가 도착하면 봉인을 잡고 위로 끌어올려 뜯은 뒤, 카드를 뒤집어 확인하세요. 설정집은 나만, 공용집은 모두가 봅니다.'],
  ['🔒', '밀담 구역', '서재·온실 같은 구역에 함께 들어가면 그 안의 사람끼리만 채팅·음성이 들립니다. 누가 들어가 있는지는 밖에서도 보여요.'],
  ['⏳', '진행 표시판', '화면 위 표시판에 지금 단계와 할 일이 나옵니다. 모두 “확인”하면 다음 단계로 넘어가고, 시간이 모자라면 누구나 연장할 수 있어요.'],
  ['🃏', '능력 카드', '손패의 카드를 위로 끌어 테이블에 내려놓으면 사용됩니다. 효과는 카드 설명대로 참가자들이 직접 적용합니다.'],
  ['🔴', '범인 지목', '마지막엔 지목 도장을 용의자 카드에 찍고, 도장 버튼을 길게 눌러 확정합니다.'],
  ['🎙️', '대화', '<b>Enter</b> 채팅 · <b>M</b> 마이크 켜기/끄기 · 대사는 원하면 소리 내어 연기해 보세요.'],
];

export function Guide(props: { onClose: () => void }) {
  useEffect(() => { sfx.paper(); const k = (e: KeyboardEvent) => { if (e.key === 'Escape') props.onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, []);
  return (
    <Portal>
      <div class="guide-back" onPointerDown={(e) => { if (e.target === e.currentTarget) props.onClose(); }}>
        <div class="guide paper">
          <div class="guide-stamp">진행 안내</div>
          <h2 class="serif">테이블에 앉은 여러분께</h2>
          <div class="guide-grid">
            {TIPS.map(([ico, title, body]) => (
              <div class="tip" key={title}>
                <div class="tip-ico">{ico}</div>
                <div><b class="serif">{title}</b><p dangerouslySetInnerHTML={{ __html: body }} /></div>
              </div>
            ))}
          </div>
          <button class="btn gold lg" onClick={props.onClose}>알겠습니다</button>
        </div>
      </div>
    </Portal>
  );
}
