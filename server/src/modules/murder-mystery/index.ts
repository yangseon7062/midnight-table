import type { GameModuleDefinition } from '../../platform/gameModule';
import type { ContentSummary } from '../../../../shared/platform';
import { MM_MODULE_ID } from '../../../../shared/mm/view';
import type { Scenario } from '../../../../shared/mm/scenario';
import { MurderMysterySession, type MMState } from './session';
import type { ScenarioStore } from './store';

export function createMurderMysteryModule(store: ScenarioStore): GameModuleDefinition {
  const summary = (s: Scenario): ContentSummary => ({
    moduleId: MM_MODULE_ID, contentId: s.id, title: s.title, subtitle: s.subtitle, summary: s.summary,
    minPlayers: s.minPlayers, maxPlayers: s.maxPlayers, playtimeMin: s.playtimeMin, cover: s.cover, tags: s.tags,
  });
  return {
    id: MM_MODULE_ID,
    name: '머더미스터리',
    description: '각자 다른 비밀을 품은 인물이 되어 대화와 추리로 진범을 찾아내는 게임',
    listContents: () => store.playable().map(summary),
    getContent: (id) => { const s = store.getPlayable(id); return s ? summary(s) : null; },
    createSession: (host, contentId, participants) => {
      const scenario = store.getPlayable(contentId);
      if (!scenario) throw new Error('시나리오를 불러올 수 없습니다');
      if (participants.length < scenario.minPlayers || participants.length > scenario.maxPlayers) throw new Error('인원이 맞지 않습니다');
      return new MurderMysterySession(host, { scenario, participants });
    },
    restoreSession: (host, snapshot, shift) => new MurderMysterySession(host, { state: snapshot as MMState, shift }),
  };
}
