// 머더미스터리 세션 규칙 단위 테스트 (가짜 호스트, 서버 없이 빠르게)
import { readFileSync } from 'node:fs';
import { validateScenario, type Scenario } from '../shared/mm/scenario';
import { MurderMysterySession } from '../server/src/modules/murder-mystery/session';
import type { GameHost, ParticipantInfo } from '../server/src/platform/gameModule';

let failures = 0;
const check = (c: boolean, m: string) => { console.log(`${c ? '  ✔' : '  ✘'} ${m}`); if (!c) failures++; };

function makeHost(ids: string[]) {
  let now = 1_000_000;
  const infos: ParticipantInfo[] = ids.map((id) => ({ userId: id, nickname: id, connected: true, absent: false }));
  const events: { target: unknown; type: string; payload: unknown }[] = [];
  let ended = false; let zonesOpen = true;
  const host: GameHost = {
    now: () => now, participants: () => infos, pushState: () => {}, emit: (target, type, payload) => events.push({ target, type, payload }),
    systemMessage: () => {}, toast: () => {}, setZones: () => {}, setZonesOpen: (o) => { zonesOpen = o; }, setBadge: () => {}, endGame: () => { ended = true; }, markDirty: () => {},
  };
  return { host, infos, events, advance: (ms: number) => { now += ms; }, isEnded: () => ended, zonesOpen: () => zonesOpen };
}

function base(): Scenario {
  return validateScenario(JSON.parse(readFileSync('data/scenarios/haemugwan.json', 'utf8'))).scenario!;
}

function runToVote(s: Scenario, ids: string[], picks: Record<string, string>) {
  const h = makeHost(ids);
  const ses = new MurderMysterySession(h.host, { scenario: s, participants: ids });
  for (const [u, c] of Object.entries(picks)) ses.onAction(u, 'pick', { charId: c });
  for (const u of ids) ses.onAction(u, 'castReady', { ready: true });
  h.advance(4000); ses.tick(h.host.now());
  let guard = 0;
  while (ses.st.stage === 'flow' && guard++ < 50) {
    const step = s.flow[ses.st.stepIndex];
    if (step.type === 'phase' && step.kind === 'vote') break;
    for (const u of ids) {
      const view = ses.viewFor(u);
      for (const k of view.step!.myItemKeys) ses.onAction(u, 'open', { key: k });
      ses.onAction(u, 'ready', { ready: true });
    }
    ses.tick(h.host.now()); h.advance(2000); ses.tick(h.host.now());
  }
  return { h, ses };
}

// 1) 공개 투표 + 성공
{
  const s = base();
  const { h, ses } = runToVote(s, ['u1', 'u2'], { u1: 'seojin', u2: 'taeo' });
  check(ses.st.scenario.flow[ses.st.stepIndex].id === 's10', '투표 단계까지 진행');
  check(h.zonesOpen() === false, '투표 단계에서 밀담 구역 닫힘 (시나리오 설정)');
  ses.onAction('u1', 'vote', { candidateId: 'kihyun' }); ses.onAction('u2', 'vote', { candidateId: 'kihyun' });
  ses.onAction('u1', 'voteConfirm', { confirmed: true }); ses.onAction('u2', 'voteConfirm', { confirmed: true });
  ses.tick(h.host.now()); h.advance(2000); ses.tick(h.host.now());
  const e = ses.st.ending!;
  check(e.outcome === 'success' && e.tally.find((t) => t.candidateId === 'kihyun')!.voters!.length === 2, '공개 투표: 성공 + 투표자 공개');
}
// 2) 익명 + 동률 → 실패
{
  const s = base(); s.settings.voteVisibility = 'anonymous';
  const { h, ses } = runToVote(s, ['u1', 'u2'], { u1: 'seojin', u2: 'taeo' });
  ses.onAction('u1', 'vote', { candidateId: 'kihyun' }); ses.onAction('u2', 'vote', { candidateId: 'yuri' });
  ses.onAction('u1', 'voteConfirm', { confirmed: true }); ses.onAction('u2', 'voteConfirm', { confirmed: true });
  ses.tick(h.host.now()); h.advance(2000); ses.tick(h.host.now());
  const e = ses.st.ending!;
  check(e.anonymous && e.tally.every((t) => t.voters === null), '익명 투표: 누가 찍었는지 숨김');
  check(e.outcome === 'failure' && e.topIds.length === 2, '동률에 진범 포함 → 실패 처리');
}
// 3) 투표 불참 캐릭터 (피해자 역할 등)
{
  const s = base(); s.characters[1].canVote = false;
  const { h, ses } = runToVote(s, ['u1', 'u2'], { u1: 'seojin', u2: 'taeo' });
  let threw = false; try { ses.onAction('u2', 'vote', { candidateId: 'kihyun' }); } catch { threw = true; }
  check(threw, '투표 불참 캐릭터는 투표 불가');
  check(ses.viewFor('u2').vote!.eligible === false && ses.viewFor('u1').vote!.eligibleCount === 1, '투표 대상 인원 계산에서 제외');
  ses.onAction('u1', 'vote', { candidateId: 'kihyun' }); ses.onAction('u1', 'voteConfirm', { confirmed: true });
  ses.tick(h.host.now()); h.advance(2000); ses.tick(h.host.now());
  check(ses.st.stage === 'flow', '불참자가 “확인”하기 전엔 대기');
  ses.onAction('u2', 'ready', { ready: true });
  ses.tick(h.host.now()); h.advance(2000); ses.tick(h.host.now());
  check(ses.st.stage === 'ending' && ses.st.ending!.outcome === 'success', '불참자 확인 후 엔딩, 한 표로 성공');
}
// 4) 공개 대상 × 열람 권한 교집합 (특정 캐릭터 대상 공개)
{
  const s = base();
  s.flow.splice(1, 0, { id: 'only-sj', type: 'reveal', title: '서진에게만', note: '', advance: 'allReady', durationSec: 0, extendSec: 120, zonesOpen: true, targets: ['seojin'], items: [{ kind: 'clue', refId: 'c-letter' }, { kind: 'sheet', refId: 'tae-2' }, { kind: 'clue', refId: 'c-will' }] });
  const h = makeHost(['u1', 'u2']);
  const ses = new MurderMysterySession(h.host, { scenario: s, participants: ['u1', 'u2'] });
  ses.onAction('u1', 'pick', { charId: 'seojin' }); ses.onAction('u2', 'pick', { charId: 'taeo' });
  ses.onAction('u1', 'castReady', { ready: true }); ses.onAction('u2', 'castReady', { ready: true });
  h.advance(4000); ses.tick(h.host.now());
  for (const u of ['u1', 'u2']) { for (const k of ses.viewFor(u).step!.myItemKeys) ses.onAction(u, 'open', { key: k }); ses.onAction(u, 'ready', { ready: true }); }
  ses.tick(h.host.now()); h.advance(2000); ses.tick(h.host.now());
  const a = ses.viewFor('u1').items.map((i) => i.key), b = ses.viewFor('u2').items.map((i) => i.key);
  check(a.includes('clue:c-letter') && !b.includes('clue:c-letter'), '대상 지정 공개: 서진만 공용 단서 수신');
  check(!a.includes('sheet:tae-2') && !b.includes('sheet:tae-2'), '대상이 아닌 캐릭터의 설정집은 아무에게도 전달 안 됨 (누설 방지)');
  check(!a.includes('clue:c-will'), '개인 단서는 열람 권한자가 대상에 없으면 전달 안 됨');
  const bAllReady = ses.viewFor('u2').step!.myItemKeys.length === 0;
  ses.onAction('u2', 'ready', { ready: true });
  check(bAllReady, '받은 자료가 없는 참가자는 바로 확인 가능');
}
// 5) 타이머 모드: 시간 종료 시 자동 진행, 연장 쿨타임 10초
{
  const s = base();
  s.flow[1].advance = 'timer'; s.flow[1].durationSec = 60;
  const h = makeHost(['u1', 'u2']);
  const ses = new MurderMysterySession(h.host, { scenario: s, participants: ['u1', 'u2'] });
  ses.onAction('u1', 'pick', { charId: 'seojin' }); ses.onAction('u2', 'pick', { charId: 'taeo' });
  ses.onAction('u1', 'castReady', { ready: true }); ses.onAction('u2', 'castReady', { ready: true });
  h.advance(4000); ses.tick(h.host.now());
  for (const u of ['u1', 'u2']) { for (const k of ses.viewFor(u).step!.myItemKeys) ses.onAction(u, 'open', { key: k }); ses.onAction(u, 'ready', { ready: true }); }
  ses.tick(h.host.now()); h.advance(2000); ses.tick(h.host.now());
  check(ses.st.stepIndex === 1, '타이머 단계 진입');
  const ends = ses.st.stepEndsAt!;
  ses.onAction('u1', 'extend', {});
  check(ses.st.stepEndsAt === ends + 120_000, '연장 +2분');
  let cool = false; try { ses.onAction('u2', 'extend', {}); } catch { cool = true; }
  check(cool, '10초 안에 다른 사람이 연장 → 거부');
  h.advance(10_001);
  ses.onAction('u2', 'extend', {});
  check(ses.st.stepEndsAt === ends + 240_000, '쿨타임 후 다시 연장 가능');
  h.advance(300_000); ses.tick(h.host.now()); h.advance(1500); ses.tick(h.host.now());
  check(ses.st.stepIndex === 2, '제한시간 종료 → 자동으로 다음 단계');
}
console.log(failures ? `\n실패 ${failures}건` : '\n규칙 단위 테스트 모두 통과');
process.exit(failures ? 1 : 0);
