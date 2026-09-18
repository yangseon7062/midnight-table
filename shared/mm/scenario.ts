import { z } from 'zod';

/**
 * 머더미스터리 시나리오 스키마. 서버(로딩/검증), 운영자 에디터(편집/검증)가 공유한다.
 * 시나리오는 순수 데이터(JSON)이며 코드 수정 없이 추가된다.
 */

const id = z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/, 'ID는 영문/숫자/-/_ 만 사용할 수 있습니다');
const text = (max = 20000) => z.string().max(max);

export const CardSchema = z.object({
  id,
  name: z.string().min(1).max(40),
  description: text(1000),
  uses: z.number().int().min(1).max(99),
});

export const CharacterSchema = z.object({
  id,
  name: z.string().min(1).max(30),
  title: z.string().max(60).default(''),          // 직업/관계 등 한 줄
  age: z.string().max(20).default(''),
  publicIntro: text(1000).default(''),              // 캐릭터 선택 화면에 공개되는 소개
  color: z.string().max(20).default('#8a6d4b'),
  portrait: z.string().max(300).nullable().default(null),
  required: z.boolean().default(true),              // 반드시 누군가 맡아야 하는지
  canVote: z.boolean().default(true),               // 투표 참여 여부
  cards: z.array(CardSchema).default([]),
});

export const SuspectSchema = z.object({
  id,
  name: z.string().min(1).max(30),
  title: z.string().max(60).default(''),
  description: text(1000).default(''),
  color: z.string().max(20).default('#6b6b6b'),
  portrait: z.string().max(300).nullable().default(null),
});

export const SheetPageSchema = z.object({
  id,
  charId: id,
  title: z.string().min(1).max(60),
  body: text(),
});

export const CommonBlockSchema = z.object({
  type: z.enum(['heading', 'narration', 'dialogue']),
  speaker: z.string().max(40).default(''),  // 화자 라벨 (dialogue)
  text: text(5000),
});

export const CommonEntrySchema = z.object({
  id,
  title: z.string().min(1).max(60),
  blocks: z.array(CommonBlockSchema).default([]),
});

export const ClueSchema = z.object({
  id,
  title: z.string().min(1).max(60),
  type: z.enum(['text', 'image']),
  text: text(5000).default(''),
  image: z.string().max(300).nullable().default(null),
  caption: z.string().max(200).default(''),
  scope: z.enum(['public', 'private']),
  owners: z.array(id).default([]),       // scope=private 일 때 열람 가능한 캐릭터
});

export const ZoneSchema = z.object({
  id,
  name: z.string().min(1).max(20),
  rect: z.object({ x: z.number(), y: z.number(), w: z.number().min(16), h: z.number().min(16) }),
});

export const RevealItemSchema = z.object({
  kind: z.enum(['sheet', 'common', 'clue']),
  refId: id,
});

export const AdvanceSchema = z.enum(['allReady', 'timer', 'either', 'immediate']);

const stepBase = {
  id,
  title: z.string().min(1).max(60),
  note: text(2000).default(''),            // 화면에 표시되는 안내 ("지금 할 수 있는 일")
  advance: AdvanceSchema,
  durationSec: z.number().int().min(0).max(4 * 3600).default(0),
  extendSec: z.number().int().min(10).max(1800).default(120),
  zonesOpen: z.boolean().default(true),
};

export const RevealStepSchema = z.object({
  ...stepBase,
  type: z.literal('reveal'),
  targets: z.union([z.literal('all'), z.array(id).min(1)]),
  items: z.array(RevealItemSchema).default([]),
});

export const PhaseStepSchema = z.object({
  ...stepBase,
  type: z.literal('phase'),
  kind: z.enum(['discussion', 'interrogation', 'vote']),
  vote: z.object({
    question: z.string().min(1).max(120),
    candidates: z.array(id).min(2),
  }).nullable().default(null),
});

export const StepSchema = z.discriminatedUnion('type', [RevealStepSchema, PhaseStepSchema]);

export const EndingTextSchema = z.object({ title: z.string().max(60).default(''), body: text().default('') });

export const ScenarioSchema = z.object({
  id,
  title: z.string().min(1).max(60),
  subtitle: z.string().max(80).default(''),
  summary: text(2000).default(''),
  cover: z.string().max(300).nullable().default(null),
  minPlayers: z.number().int().min(1).max(12),
  maxPlayers: z.number().int().min(1).max(12),
  playtimeMin: z.number().int().min(5).max(600).default(60),
  tags: z.array(z.string().max(20)).default([]),
  published: z.boolean().default(true),
  settings: z.object({
    voteVisibility: z.enum(['anonymous', 'public']).default('public'),
  }).default({ voteVisibility: 'public' }),
  characters: z.array(CharacterSchema).min(1),
  suspects: z.array(SuspectSchema).default([]),
  sheetPages: z.array(SheetPageSchema).default([]),
  commonEntries: z.array(CommonEntrySchema).default([]),
  clues: z.array(ClueSchema).default([]),
  zones: z.array(ZoneSchema).default([]),
  flow: z.array(StepSchema).min(1),
  ending: z.object({
    voteStepId: id.nullable().default(null),
    culpritIds: z.array(id).default([]),
    truth: EndingTextSchema.default({ title: '사건의 진상', body: '' }),
    success: EndingTextSchema.default({ title: '진범 검거', body: '' }),
    failure: EndingTextSchema.default({ title: '진범 도주', body: '' }),
    characterEndings: z.array(z.object({ charId: id, success: text().default(''), failure: text().default('') })).default([]),
  }),
});

export type Card = z.infer<typeof CardSchema>;
export type Character = z.infer<typeof CharacterSchema>;
export type Suspect = z.infer<typeof SuspectSchema>;
export type SheetPage = z.infer<typeof SheetPageSchema>;
export type CommonBlock = z.infer<typeof CommonBlockSchema>;
export type CommonEntry = z.infer<typeof CommonEntrySchema>;
export type Clue = z.infer<typeof ClueSchema>;
export type ScenarioZone = z.infer<typeof ZoneSchema>;
export type RevealItem = z.infer<typeof RevealItemSchema>;
export type RevealStep = z.infer<typeof RevealStepSchema>;
export type PhaseStep = z.infer<typeof PhaseStepSchema>;
export type Step = z.infer<typeof StepSchema>;
export type Scenario = z.infer<typeof ScenarioSchema>;

export interface ScenarioIssue { level: 'error' | 'warn'; path: string; message: string }

/** 스키마 검사 + 참조 무결성/논리 검사. error 가 하나라도 있으면 저장/플레이 불가 */
export function validateScenario(input: unknown): { scenario: Scenario | null; issues: ScenarioIssue[] } {
  const issues: ScenarioIssue[] = [];
  const parsed = ScenarioSchema.safeParse(input);
  if (!parsed.success) {
    for (const i of parsed.error.issues) issues.push({ level: 'error', path: i.path.join('.'), message: i.message });
    return { scenario: null, issues };
  }
  const s = parsed.data;
  const err = (path: string, message: string) => issues.push({ level: 'error', path, message });
  const warn = (path: string, message: string) => issues.push({ level: 'warn', path, message });

  const dup = (arr: { id: string }[], label: string, path: string) => {
    const seen = new Set<string>();
    arr.forEach((x, i) => { if (seen.has(x.id)) err(`${path}.${i}.id`, `${label} ID '${x.id}' 가 중복됩니다`); seen.add(x.id); });
  };
  dup(s.characters, '캐릭터', 'characters');
  dup(s.suspects, 'NPC 용의자', 'suspects');
  dup(s.sheetPages, '설정집 페이지', 'sheetPages');
  dup(s.commonEntries, '공용집 항목', 'commonEntries');
  dup(s.clues, '단서', 'clues');
  dup(s.zones, '밀담 구역', 'zones');
  dup(s.flow, '진행 단계', 'flow');

  const charIds = new Set(s.characters.map((c) => c.id));
  const personIds = new Set([...charIds, ...s.suspects.map((x) => x.id)]);
  s.suspects.forEach((x, i) => { if (charIds.has(x.id)) err(`suspects.${i}.id`, `NPC 용의자 ID '${x.id}' 가 캐릭터 ID 와 겹칩니다`); });

  if (s.minPlayers > s.maxPlayers) err('minPlayers', '최소 인원이 최대 인원보다 많습니다');
  if (s.maxPlayers > s.characters.length) err('maxPlayers', `최대 인원(${s.maxPlayers})이 캐릭터 수(${s.characters.length})보다 많습니다`);
  const requiredCount = s.characters.filter((c) => c.required).length;
  if (requiredCount > s.minPlayers) err('minPlayers', `필수 캐릭터(${requiredCount}명)를 모두 채우려면 최소 인원이 ${requiredCount}명 이상이어야 합니다`);

  s.characters.forEach((c, i) => dup(c.cards, `${c.name}의 카드`, `characters.${i}.cards`));
  s.sheetPages.forEach((p, i) => { if (!charIds.has(p.charId)) err(`sheetPages.${i}.charId`, `설정집 '${p.title}' 의 캐릭터 '${p.charId}' 가 없습니다`); });
  s.clues.forEach((c, i) => {
    if (c.type === 'image' && !c.image) err(`clues.${i}.image`, `이미지 단서 '${c.title}' 에 이미지가 없습니다`);
    if (c.scope === 'private') {
      if (c.owners.length === 0) err(`clues.${i}.owners`, `개인 단서 '${c.title}' 의 열람 캐릭터가 지정되지 않았습니다`);
      c.owners.forEach((o) => { if (!charIds.has(o)) err(`clues.${i}.owners`, `단서 '${c.title}' 의 캐릭터 '${o}' 가 없습니다`); });
    }
  });

  const sheetById = new Map(s.sheetPages.map((p) => [p.id, p]));
  const commonIds = new Set(s.commonEntries.map((c) => c.id));
  const clueById = new Map(s.clues.map((c) => [c.id, c]));
  const revealed = new Set<string>();

  s.flow.forEach((step, i) => {
    const p = `flow.${i}`;
    if ((step.advance === 'timer' || step.advance === 'either') && step.durationSec <= 0) err(`${p}.durationSec`, `'${step.title}': 타이머 진행 조건에는 제한시간이 필요합니다`);
    if (step.type === 'reveal') {
      if (step.targets !== 'all') step.targets.forEach((t) => { if (!charIds.has(t)) err(`${p}.targets`, `'${step.title}': 대상 캐릭터 '${t}' 가 없습니다`); });
      if (step.items.length === 0) warn(`${p}.items`, `'${step.title}': 공개할 내용이 없습니다`);
      step.items.forEach((it, j) => {
        const key = `${it.kind}:${it.refId}`;
        if (revealed.has(key)) warn(`${p}.items.${j}`, `'${step.title}': '${it.refId}' 는 이미 앞 단계에서 공개되었습니다`);
        revealed.add(key);
        const targets = step.targets === 'all' ? [...charIds] : step.targets;
        if (it.kind === 'sheet') {
          const page = sheetById.get(it.refId);
          if (!page) return err(`${p}.items.${j}`, `'${step.title}': 설정집 페이지 '${it.refId}' 가 없습니다`);
          if (!targets.includes(page.charId)) warn(`${p}.items.${j}`, `'${step.title}': 설정집 '${page.title}' 의 주인이 대상에 없어 아무도 받지 못합니다`);
        } else if (it.kind === 'common') {
          if (!commonIds.has(it.refId)) err(`${p}.items.${j}`, `'${step.title}': 공용집 항목 '${it.refId}' 가 없습니다`);
        } else {
          const clue = clueById.get(it.refId);
          if (!clue) return err(`${p}.items.${j}`, `'${step.title}': 단서 '${it.refId}' 가 없습니다`);
          if (clue.scope === 'private' && !clue.owners.some((o) => targets.includes(o))) warn(`${p}.items.${j}`, `'${step.title}': 개인 단서 '${clue.title}' 의 열람자가 대상에 없어 아무도 받지 못합니다`);
        }
      });
    } else {
      if (step.kind === 'vote') {
        if (!step.vote) err(`${p}.vote`, `'${step.title}': 투표 질문과 후보가 필요합니다`);
        else step.vote.candidates.forEach((c) => { if (!personIds.has(c)) err(`${p}.vote.candidates`, `'${step.title}': 후보 '${c}' 가 캐릭터/NPC 목록에 없습니다`); });
        if (step.advance === 'immediate') err(`${p}.advance`, `'${step.title}': 투표 단계는 즉시 진행할 수 없습니다`);
      } else if (step.advance === 'immediate') err(`${p}.advance`, `'${step.title}': 페이즈 단계는 즉시 진행할 수 없습니다`);
    }
  });

  const e = s.ending;
  const voteSteps = s.flow.filter((x) => x.type === 'phase' && x.kind === 'vote');
  if (e.voteStepId && !voteSteps.some((v) => v.id === e.voteStepId)) err('ending.voteStepId', `엔딩 기준 투표 단계 '${e.voteStepId}' 가 없습니다`);
  if (!e.voteStepId && voteSteps.length === 0) warn('ending', '투표 단계가 없어 범인 지목 결과 없이 엔딩이 표시됩니다');
  e.culpritIds.forEach((c) => { if (!personIds.has(c)) err('ending.culpritIds', `진범 '${c}' 가 캐릭터/NPC 목록에 없습니다`); });
  if (voteSteps.length > 0 && e.culpritIds.length === 0) warn('ending.culpritIds', '진범이 지정되지 않았습니다');
  e.characterEndings.forEach((ce, i) => { if (!charIds.has(ce.charId)) err(`ending.characterEndings.${i}`, `캐릭터 '${ce.charId}' 가 없습니다`); });

  return { scenario: s, issues };
}

export const ADVANCE_LABEL: Record<z.infer<typeof AdvanceSchema>, string> = {
  allReady: '참가자 전원 확인 시',
  timer: '타이머 종료 시',
  either: '타이머 종료 또는 전원 확인 시',
  immediate: '즉시 (다음 단계로 바로)',
};
export const PHASE_KIND_LABEL = { discussion: '토론', interrogation: '심문/밀담', vote: '투표' } as const;
