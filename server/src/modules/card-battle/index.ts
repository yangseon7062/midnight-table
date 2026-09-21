import type { GameModuleDefinition } from '../../platform/gameModule';
import type { ContentSummary } from '../../../../shared/platform';
import { CB_CONTENT_PVP, CB_CONTENT_SOLO, CB_MODULE_ID } from '../../../../shared/cb/types';
import { CardBattleSession, type CBSnapshot } from './session';

/**
 * 카드 대전 모듈 정의 — 플랫폼과의 접점 두 곳 중 하나.
 *
 * 테이블 목록에 뜨려면 세 가지가 다 있어야 한다 (기준서 11-1):
 *   1. 여기서 만든 정의를 server/src/index.ts 의 modules 에 등록
 *   2. listContents() 가 콘텐츠를 돌려줄 것  ← 비면 테이블에 아무것도 안 뜬다
 *   3. client/src/modules/registry.ts 의 clientModules 에 UI 등록
 */

/**
 * 콘텐츠 2개 (기준서 0-1).
 * 하나로 합쳐 minPlayers 1 / maxPlayers 2 로 두면 한 명만 앉은 시점에 판이 시작돼
 * 친구가 앉을 틈이 없다. 그래서 나눈다.
 * maxPlayers 를 2로 막으므로 3명 이상이 앉는 상황 자체가 생기지 않는다.
 */
const CONTENTS: readonly ContentSummary[] = [
  {
    moduleId: CB_MODULE_ID,
    contentId: CB_CONTENT_PVP,
    title: '1:1 카드 대전',
    subtitle: '사람 대 사람',
    summary: '4×3 보드에서 한 턴에 카드 3장을 골라 동시에 여는 턴제 대전. 상대의 다음 세 장을 읽는 심리전이다.',
    minPlayers: 2,
    maxPlayers: 2,
    playtimeMin: 15,
    cover: null,
    tags: ['대전', '턴제', '심리전'],
  },
  {
    moduleId: CB_MODULE_ID,
    contentId: CB_CONTENT_SOLO,
    title: '카드 대전 — AI 연습',
    subtitle: '혼자 연습',
    summary: '같은 규칙으로 AI와 겨룬다. 규칙을 익히거나 수치를 확인할 때 쓴다.',
    minPlayers: 1,
    maxPlayers: 1,
    playtimeMin: 10,
    cover: null,
    tags: ['연습', 'AI'],
  },
];

export function createCardBattleModule(): GameModuleDefinition {
  const find = (id: string) => CONTENTS.find((c) => c.contentId === id) ?? null;
  return {
    id: CB_MODULE_ID,
    name: '카드 대전',
    description: '4×3 보드에서 카드 3장을 골라 동시에 여는 1:1 턴제 대전',
    listContents: () => [...CONTENTS],
    getContent: (id) => find(id),
    createSession: (host, contentId, participants) => {
      const content = find(contentId);
      if (!content) throw new Error('콘텐츠를 불러올 수 없습니다');
      if (participants.length < content.minPlayers || participants.length > content.maxPlayers) {
        throw new Error('인원이 맞지 않습니다');
      }
      return new CardBattleSession(host, { participants, contentId });
    },
    restoreSession: (host, snapshot, shift) =>
      new CardBattleSession(host, { snapshot: snapshot as CBSnapshot, shift }),
  };
}
