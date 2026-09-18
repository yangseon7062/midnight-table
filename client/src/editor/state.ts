import { signal, computed } from '@preact/signals';
import { validateScenario, type Scenario } from '@shared/mm/scenario';
import { MAPS } from '@shared/world';

/** 에디터 상태: 편집 중인 시나리오 초안(raw JSON) + 저장 상태 */

export const token = signal<string | null>(sessionStorage.getItem('midnight.admin') ?? null);
export const draft = signal<Scenario | null>(null);
export const savedJson = signal<string>('');
export const dirty = computed(() => !!draft.value && JSON.stringify(draft.value) !== savedJson.value);
export const validation = computed(() => (draft.value ? validateScenario(draft.value) : { scenario: null, issues: [] }));
export const tab = signal<string>('basic');
export const focusPath = signal<string | null>(null);

export function update(fn: (d: Scenario) => void) {
  if (!draft.value) return;
  const next = structuredClone(draft.value);
  fn(next);
  draft.value = next;
}

export const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 7)}`;

export async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`/api/admin${path}`, {
    ...init,
    headers: { ...(init.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}), 'x-admin-token': token.value ?? '', ...(init.headers ?? {}) },
  });
  const data = await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }));
  if (res.status === 401 && path !== '/login') { token.value = null; sessionStorage.removeItem('midnight.admin'); }
  return data;
}

export async function uploadImage(file: File): Promise<string | null> {
  const fd = new FormData();
  fd.append('file', file);
  const r = await api('/upload', { method: 'POST', body: fd });
  if (!r.ok) { alert(r.error); return null; }
  return r.url;
}

export function newScenarioTemplate(): Scenario {
  const zones = MAPS.salon.defaultZones.map((z) => ({ id: `z-${z.id}`, name: z.name, rect: { ...z.rect } }));
  return {
    id: uid('sc'), title: '새 시나리오', subtitle: '', summary: '', cover: null, minPlayers: 2, maxPlayers: 2, playtimeMin: 60, tags: [], published: false,
    settings: { voteVisibility: 'public' },
    characters: [
      { id: 'char-a', name: '인물 A', title: '', age: '', publicIntro: '', color: '#8e3b46', portrait: null, required: true, canVote: true, cards: [] },
      { id: 'char-b', name: '인물 B', title: '', age: '', publicIntro: '', color: '#2f5c73', portrait: null, required: true, canVote: true, cards: [] },
    ],
    suspects: [],
    sheetPages: [
      { id: 'sheet-a1', charId: 'char-a', title: '인물 A — 설정집', body: '# 인물 A\n\n## 공개해도 좋은 정보\n- \n\n## 당신의 비밀\n!! \n\n## 목표\n1. ' },
      { id: 'sheet-b1', charId: 'char-b', title: '인물 B — 설정집', body: '# 인물 B\n\n## 공개해도 좋은 정보\n- \n\n## 당신의 비밀\n!! \n\n## 목표\n1. ' },
    ],
    commonEntries: [{ id: 'common-1', title: '프롤로그', blocks: [{ type: 'narration', speaker: '', text: '사건이 일어난 밤…' }] }],
    clues: [],
    zones,
    flow: [
      { id: 'step-1', type: 'reveal', title: '프롤로그와 설정집', note: '봉투를 열어 끝까지 읽은 뒤 확인을 눌러 주세요.', advance: 'allReady', durationSec: 600, extendSec: 120, zonesOpen: false, targets: 'all', items: [{ kind: 'common', refId: 'common-1' }, { kind: 'sheet', refId: 'sheet-a1' }, { kind: 'sheet', refId: 'sheet-b1' }] },
      { id: 'step-2', type: 'phase', kind: 'discussion', title: '자유 토론', note: '', advance: 'either', durationSec: 900, extendSec: 120, zonesOpen: true, vote: null },
      { id: 'step-3', type: 'phase', kind: 'vote', title: '범인 지목', note: '', advance: 'allReady', durationSec: 300, extendSec: 60, zonesOpen: false, vote: { question: '범인은 누구인가?', candidates: ['char-a', 'char-b'] } },
    ],
    ending: {
      voteStepId: 'step-3', culpritIds: ['char-a'],
      truth: { title: '사건의 진상', body: '' }, success: { title: '진범 검거', body: '' }, failure: { title: '진범 도주', body: '' },
      characterEndings: [{ charId: 'char-a', success: '', failure: '' }, { charId: 'char-b', success: '', failure: '' }],
    },
  };
}
