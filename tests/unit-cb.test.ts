// 카드 대전 전투 엔진 단위 테스트 (서버·UI 없이 순수 함수만)
// 기준서 13번 체크리스트를 그대로 옮긴 것이다.
import {
  BOARD_COLS,
  BOARD_ROWS,
  TURN_LIMIT,
  type BattleState,
  type Pos,
  type Side,
} from '../shared/cb/types';
import { CHARACTERS, getCharacter } from '../server/src/modules/card-battle/data/characters';
import { RANGES, isLeftRightSymmetric } from '../server/src/modules/card-battle/data/ranges';
import { SKILL_CARDS, SKILL_RANGE_CODE, getCard, handIdsFor } from '../server/src/modules/card-battle/data/cards';
import {
  cloneState,
  createBattle,
  deserialize,
  serialize,
} from '../server/src/modules/card-battle/engine/battleState';
import {
  autoAssignCharacters,
  beginSelecting,
  bothCharsLocked,
  chooseCharacter,
  revealCharacters,
} from '../server/src/modules/card-battle/engine/characterSelect';
import { applyMove } from '../server/src/modules/card-battle/engine/movementResolver';
import { rangeCells } from '../server/src/modules/card-battle/engine/attackResolver';
import {
  advanceAfterTurn,
  applySelectTimeout,
  randomSubmission,
  resolveTurn,
  submitCards,
  validateSubmission,
} from '../server/src/modules/card-battle/engine/turnResolver';
import { forfeit, hpRatio } from '../server/src/modules/card-battle/engine/winResolver';
import { aiContext } from '../server/src/modules/card-battle/ai/context';
import { normalPick } from '../server/src/modules/card-battle/ai/normalAI';
import { hardPick } from '../server/src/modules/card-battle/ai/hardAI';

let failures = 0;
const check = (c: boolean, m: string) => { console.log(`${c ? '  ✔' : '  ✘'} ${m}`); if (!c) failures++; };
const section = (t: string) => console.log(`\n── ${t}`);

const T0 = 1_000_000;

function battle(c1: string, c2: string, seed = 1): BattleState {
  const st = createBattle({ p1UserId: 'u1', p2UserId: 'u2', now: T0, seed });
  chooseCharacter(st, 'p1', c1);
  chooseCharacter(st, 'p2', c2);
  revealCharacters(st);
  beginSelecting(st, T0);
  return st;
}

function place(st: BattleState, p1: Pos, p2: Pos): void {
  st.p1.pos = { ...p1 };
  st.p2.pos = { ...p2 };
}

function playTurn(st: BattleState, a: readonly string[], b: readonly string[]) {
  submitCards(st, 'p1', a);
  submitCards(st, 'p2', b);
  const res = resolveTurn(st);
  advanceAfterTurn(st, T0);
  return res;
}

const MOVES3 = ['move_up', 'move_down', 'move_left'] as const;

/* ═══════════════════════════ 데이터 — 기준서 9번 표 ═══════════════════════════ */
section('데이터 (기준서 9번 표)');
{
  const EXPECT_CHARS: readonly (readonly [string, number, number])[] = [
    ['c1', 200, 100], ['c2', 185, 105], ['c3', 205, 100], ['c4', 195, 110],
    ['c5', 190, 105], ['c6', 195, 100], ['c7', 200, 100], ['c8', 205, 110],
  ];
  const charOk = EXPECT_CHARS.every(([id, hp, en]) => {
    const c = getCharacter(id);
    return c.maxHp === hp && c.maxEn === en;
  });
  check(charOk && CHARACTERS.length === 8, '캐릭터 8명의 HP / Max EN 이 표와 일치');

  const EXPECT_SKILLS: readonly (readonly [string, number, number, string])[] = [
    ['c1_a', 24, 25, 'H'], ['c1_b', 46, 55, 'D'], ['c1_c', 30, 35, 'C'], ['c1_d', 32, 35, 'X'],
    ['c2_a', 42, 50, 'X'], ['c2_b', 20, 30, 'A'], ['c2_c', 28, 35, 'D'], ['c2_d', 30, 35, 'C'],
    ['c3_a', 40, 55, 'H'], ['c3_b', 30, 30, 'V'], ['c3_c', 19, 15, 'C'], ['c3_d', 24, 40, 'A'],
    ['c4_a', 55, 60, 'T'], ['c4_b', 18, 15, 'B'], ['c4_c', 29, 30, 'H'], ['c4_d', 28, 25, 'C'],
    ['c5_a', 45, 55, 'U'], ['c5_b', 30, 35, 'O'], ['c5_c', 19, 15, 'H'], ['c5_d', 32, 35, 'X'],
    ['c6_a', 31, 25, 'H'], ['c6_b', 48, 55, 'X'], ['c6_c', 20, 15, 'V'], ['c6_d', 32, 35, 'D'],
    ['c7_a', 41, 45, 'U'], ['c7_b', 26, 25, 'X'], ['c7_c', 58, 60, 'V'], ['c7_d', 29, 20, 'H'],
    ['c8_a', 57, 65, 'V'], ['c8_b', 19, 15, 'B'], ['c8_c', 42, 55, 'U'], ['c8_d', 27, 20, 'H'],
  ];
  const skillOk = EXPECT_SKILLS.every(([id, dm, en, range]) => {
    const c = getCard(id);
    return c.damage === dm && c.energyCost === en && SKILL_RANGE_CODE.get(id) === range;
  });
  check(skillOk && SKILL_CARDS.length === 32, '기술 32장의 DM / EN / range 가 표와 일치');
  check(CHARACTERS.every((c) => handIdsFor(c.id).length === 14), '캐릭터마다 손패 14장 (이동 6 + 방어·보조 4 + 기술 4)');
  check(Object.values(RANGES).every(isLeftRightSymmetric), '범위 10종 전부 좌우 대칭 (기준서 8번)');
  check(BOARD_ROWS === 3 && BOARD_COLS === 4, '보드는 4열 × 3행');

  // 이름은 수치와 **따로** 검사한다. 이름을 고치다 숫자를 건드리면 위의 표 검사가 먼저 터지고,
  // 숫자를 고치다 이름이 빠지면 여기가 터진다. 기준서 9번 표는 이 둘을 같이 봐야 재현된다.
  const EXPECT_NAMES: readonly (readonly [string, string, string])[] = [
    ['c1', '하진', '물길'], ['c2', '소윤', '종잇장'], ['c3', '석우', '문지기'], ['c4', '탁오', '덫'],
    ['c5', '채령', '풍경'], ['c6', '여울', '잔발'], ['c7', '한서', '한 자루'], ['c8', '무진', '종지기'],
  ];
  check(
    EXPECT_NAMES.every(([id, name, alias]) => {
      const c = getCharacter(id);
      return c.name === name && c.alias === alias && c.weapon.length > 0 && c.intro.length > 0;
    }),
    '캐릭터 8명의 이름 · 이명 · 무기 · 소개가 다 있다',
  );

  const EXPECT_SKILL_NAMES: readonly (readonly [string, string])[] = [
    ['c1_a', '한 획'], ['c1_b', '내려 긋기'], ['c1_c', '열십자'], ['c1_d', '엇결'],
    ['c2_a', '네 모서리'], ['c2_b', '사방 결계'], ['c2_c', '먹물 쏟기'], ['c2_d', '십자 봉인'],
    ['c3_a', '빗장 지르기'], ['c3_b', '곧은 창'], ['c3_c', '네 번 찌르기'], ['c3_d', '방패 돌리기'],
    ['c4_a', '낚아채기'], ['c4_b', '발목 걸기'], ['c4_c', '사슬 후리기'], ['c4_d', '그물 조이기'],
    ['c5_a', '높은 바람'], ['c5_b', '겹울림'], ['c5_c', '스치기'], ['c5_d', '네 갈래 바람'],
    ['c6_a', '스쳐 베기'], ['c6_b', '교차 베기'], ['c6_c', '찔러 올리기'], ['c6_d', '낮게 쓸기'],
    ['c7_a', '치켜올림'], ['c7_b', '비껴 찌르기'], ['c7_c', '한 줄 꿰기'], ['c7_d', '가로 쓸기'],
    ['c8_a', '내려찍기'], ['c8_b', '땅 울리기'], ['c8_c', '올려치기'], ['c8_d', '휩쓸기'],
  ];
  check(EXPECT_SKILL_NAMES.every(([id, name]) => getCard(id).name === name), '기술 32장의 이름이 표와 일치');
  check(
    CHARACTERS.every((c) => new Set(handIdsFor(c.id).map((id) => getCard(id).name)).size === 14),
    '한 캐릭터의 손패 14장 안에서 이름이 겹치지 않는다',
  );
}

/* ═══════════════════════════ 캐릭터 선택 ═══════════════════════════ */
section('캐릭터 선택 (기준서 2-1)');
{
  const st = createBattle({ p1UserId: 'u1', p2UserId: 'u2', now: T0 });
  check(st.phase === 'charSelect' && st.deadline === T0 + 30_000, '첫 단계는 캐릭터 선택, 제한 30초');
  chooseCharacter(st, 'p1', 'c1');
  check(st.p1.charLocked && !bothCharsLocked(st), '확정하면 잠기고, 상대가 아직이면 공개되지 않음');
  let blocked = false;
  try { chooseCharacter(st, 'p1', 'c2'); } catch { blocked = true; }
  check(blocked, '확정 후에는 바꿀 수 없음');
  check(st.p1.hp === 0 && st.p1.en === 0, '공개 전에는 HP / 기력이 아직 없음');

  autoAssignCharacters(st);
  check(st.p2.charLocked && st.p2.charAuto && st.p2.characterId !== null, '마감 후 안 고른 쪽은 서버가 랜덤 배정');
  check(st.p2.autoPickStreak === 0, '랜덤 배정은 자동 선택 3연속 카운트에 안 들어감');
  check(!st.p1.charAuto, '직접 고른 쪽은 랜덤 배정으로 표시되지 않음');

  revealCharacters(st);
  check(st.phase === 'charReveal', '둘 다 확정되면 동시 공개');
  check(st.p1.hp === getCharacter('c1').maxHp && st.p1.en === getCharacter('c1').maxEn, '공개 시점에 HP = Max HP, 기력 = Max EN');
}
{
  const st = battle('c4', 'c4');
  check(st.p1.characterId === 'c4' && st.p2.characterId === 'c4', '동일 캐릭터 대전 허용');
  check(st.p1.pos.row === 1 && st.p1.pos.col === 0 && st.p2.pos.row === 1 && st.p2.pos.col === 3, '1P 왼쪽 / 2P 오른쪽 시작');
}

/* ═══════════════════════════ 이동과 보드 ═══════════════════════════ */
section('이동과 보드 (기준서 3번)');
{
  const one = (dr: number, dc: number) => ({ dr, dc, steps: 1 });
  const two = (dc: number) => ({ dr: 0, dc, steps: 2 });
  const a = applyMove({ row: 1, col: 0 }, one(0, 1));
  check(a.to.col === 1 && a.moved === 1 && !a.blocked, '1칸 이동');
  const b = applyMove({ row: 1, col: 0 }, one(0, -1));
  check(b.to.col === 0 && b.moved === 0 && b.blocked, '경계에 막힌 1칸 이동 — 제자리');
  const c = applyMove({ row: 1, col: 0 }, two(1));
  check(c.to.col === 2 && c.moved === 2 && !c.blocked, '2칸 이동');
  const d = applyMove({ row: 1, col: 2 }, two(1));
  check(d.to.col === 3 && d.moved === 1 && d.blocked, '2칸 중 1칸만 가능 — 1칸 가고 멈춤');
  const e = applyMove({ row: 1, col: 3 }, two(1));
  check(e.to.col === 3 && e.moved === 0 && e.blocked, '2칸 중 0칸 가능 — 제자리');
  const f = applyMove({ row: 0, col: 1 }, one(-1, 0));
  check(f.to.row === 0 && f.moved === 0 && f.blocked, '위 경계');
  const g = applyMove({ row: 2, col: 1 }, one(1, 0));
  check(g.to.row === 2 && g.moved === 0 && g.blocked, '아래 경계');
}
{
  // 같은 칸 점유 · 경로 교차
  const st = battle('c1', 'c1');
  playTurn(st, ['move_right2', 'move_up', 'move_down'], ['move_left', 'move_up', 'move_down']);
  check(st.p1.pos.col === 2 && st.p2.pos.col === 2 && st.p1.pos.row === st.p2.pos.row, '같은 칸에 둘이 같이 설 수 있음');
}
{
  // 자리 바꿈
  const st = battle('c1', 'c1');
  place(st, { row: 1, col: 1 }, { row: 1, col: 2 });
  playTurn(st, ['move_right', 'move_up', 'move_down'], ['move_left', 'move_up', 'move_down']);
  check(st.p1.pos.col === 2 && st.p2.pos.col === 1, '자리 바꿈 허용 (서로의 칸으로 지나감)');
}
{
  // 이동 후 공격 명중 — 같은 슬롯에서 비공격이 먼저 처리된다
  const st = battle('c1', 'c1');
  place(st, { row: 1, col: 0 }, { row: 1, col: 2 });
  const res = playTurn(st, ['move_right', 'c1_a', 'move_up'], ['move_up', 'move_down', 'move_left']);
  const atk = res[1].steps.find((s) => s.kind === 'attack');
  check(atk?.kind === 'attack' && atk.hit, '슬롯 1에서 이동한 뒤, 슬롯 2의 공격이 이동한 자리 기준으로 명중');
}

/* ═══════════════════════════ 공격 범위 ═══════════════════════════ */
section('공격 범위 (기준서 8번)');
{
  const cells = rangeCells({ row: 0, col: 0 }, RANGES.A);
  check(cells.length === 4, '보드 밖 범위 칸은 무시 (모서리에서 전 범위 → 4칸)');
  const mid = rangeCells({ row: 1, col: 1 }, RANGES.A);
  check(mid.length === 9, '보드 안쪽에서는 9칸 전부');
}
{
  // 자기 피해 면제 + 같은 칸의 상대 피해
  const st = battle('c2', 'c1');
  place(st, { row: 1, col: 1 }, { row: 1, col: 1 });
  const hp1 = st.p1.hp;
  const res = playTurn(st, ['c2_b', 'move_up', 'move_down'], ['move_up', 'move_down', 'move_left']);
  check(st.p1.hp === hp1, '자기 칸이 범위에 들어도 자신은 피해를 받지 않음');
  check(res[0].hpAfter.p2 === getCharacter('c1').maxHp - 20, '같은 칸에 있는 상대는 정상 피해');
}
{
  // 범위 밖 = MISS, 그래도 기력은 나감
  const st = battle('c1', 'c1');
  place(st, { row: 1, col: 0 }, { row: 1, col: 3 });
  const res = playTurn(st, ['c1_a', 'move_up', 'move_down'], ['move_up', 'move_down', 'move_left']);
  const atk = res[0].steps.find((s) => s.kind === 'attack');
  check(atk?.kind === 'attack' && !atk.hit && atk.dealt === 0, '범위 밖이면 MISS, 피해 0');
  check(res[0].enAfter.p1 === getCharacter('c1').maxEn - 25, 'MISS 여도 기력은 소모');
}

/* ═══════════════════════════ 방어 ═══════════════════════════ */
section('Guard / Perfect Guard (기준서 7번)');
{
  const st = battle('c1', 'c1');
  place(st, { row: 1, col: 1 }, { row: 2, col: 1 });
  const res = playTurn(st, ['c1_b', 'move_up', 'move_down'], ['guard', 'move_up', 'move_down']);
  const atk = res[0].steps.find((s) => s.kind === 'attack');
  check(atk?.kind === 'attack' && atk.dealt === 31 && atk.reduced === 15, 'Guard — 46 피해가 15 깎여 31');
  check(res[0].enAfter.p2 === getCharacter('c1').maxEn, 'Guard 는 기력 0');
}
{
  const st = battle('c1', 'c1');
  place(st, { row: 1, col: 1 }, { row: 2, col: 1 });
  const res = playTurn(st, ['c1_b', 'move_up', 'move_down'], ['perfect_guard', 'move_up', 'move_down']);
  const atk = res[0].steps.find((s) => s.kind === 'attack');
  check(atk?.kind === 'attack' && atk.dealt === 0, 'Perfect Guard — 피해 전부 무효');
  check(res[0].enAfter.p2 === getCharacter('c1').maxEn - 25, 'Perfect Guard 는 기력 25');
}
{
  // 슬롯이 끝나면 방어가 풀린다
  const st = battle('c1', 'c1');
  place(st, { row: 1, col: 1 }, { row: 2, col: 1 });
  const res = playTurn(st, ['move_up', 'c1_b', 'move_down'], ['guard', 'move_up', 'move_down']);
  const atk = res[1].steps.find((s) => s.kind === 'attack');
  check(atk?.kind === 'attack' && atk.dealt === 46, '앞 슬롯의 Guard 는 다음 슬롯에 적용되지 않음');
  check(st.p1.guard === 'none' && st.p2.guard === 'none', '턴이 끝나면 방어 상태가 남아 있지 않음');
}

/* ═══════════════════════════ 동시 판정과 사망 ═══════════════════════════ */
section('동시 판정과 사망 (기준서 6번, 7-1)');
{
  const st = battle('c1', 'c1');
  place(st, { row: 1, col: 1 }, { row: 1, col: 1 });
  const max = getCharacter('c1').maxHp;
  const res = playTurn(st, ['c1_a', 'move_up', 'move_down'], ['c1_a', 'move_up', 'move_down']);
  check(res[0].hpAfter.p1 === max - 24 && res[0].hpAfter.p2 === max - 24, '공격 대 공격 — 같은 스냅샷으로 동시 판정, 양쪽 다 맞음');
}
{
  const st = battle('c1', 'c1');
  place(st, { row: 1, col: 1 }, { row: 1, col: 1 });
  st.p1.hp = 20; st.p2.hp = 20;
  playTurn(st, ['c1_a', 'move_up', 'move_down'], ['c1_a', 'move_up', 'move_down']);
  check(st.phase === 'finished' && st.result?.winner === 'draw' && st.result.reason === 'hp', '동시 사망은 무승부');
}
{
  const st = battle('c1', 'c1');
  place(st, { row: 1, col: 1 }, { row: 1, col: 1 });
  st.p2.hp = 10;
  // 상대가 슬롯 1에서 이동해 버리면 빗나가므로, 제자리에 남는 카드로 둔다
  const res = playTurn(st, ['c1_a', 'c1_c', 'move_down'], ['energy_up', 'move_down', 'move_left']);
  check(res.length === 1 && res[0].finished, '사망하면 남은 슬롯은 실행되지 않음');
  check(st.result?.winner === 'p1' && st.result.reason === 'hp', 'HP 0 → 상대 승리');
}

/* ═══════════════════════════ 기력 ═══════════════════════════ */
section('기력 (기준서 7번)');
{
  const st = battle('c1', 'c1');
  st.p1.en = 100;
  playTurn(st, ['energy_up', 'move_up', 'move_down'], MOVES3);
  check(st.p1.en === 100, 'Energy Up 은 Max EN 을 넘지 않음');
}
{
  const st = battle('c1', 'c1');
  st.p1.en = 70;
  playTurn(st, ['heal', 'move_up', 'move_down'], MOVES3);
  check(st.p1.hp === getCharacter('c1').maxHp && st.p1.en === 10, 'Heal 은 Max HP 를 넘지 않고, 기력 60 은 나감');
}
{
  const st = battle('c1', 'c1');
  st.p1.hp = 100;
  playTurn(st, ['heal', 'move_up', 'move_down'], MOVES3);
  check(st.p1.hp === 140, 'Heal 은 HP +40');
}
{
  const st = battle('c1', 'c1');
  place(st, { row: 1, col: 0 }, { row: 1, col: 3 });
  playTurn(st, ['c1_a', 'move_up', 'move_down'], MOVES3);
  const after = st.p1.en;
  playTurn(st, MOVES3, MOVES3);
  check(st.p1.en === after, '턴이 끝나도 기력은 저절로 회복되지 않음');
}

/* ═══════════════════════════ 카드 선택 ═══════════════════════════ */
section('카드 선택 (기준서 4번)');
{
  const st = battle('c1', 'c1');
  check(!validateSubmission(st, 'p1', ['move_up', 'move_down']).ok, '3장이 아니면 거부');
  check(!validateSubmission(st, 'p1', ['move_up', 'move_up', 'move_down']).ok, '같은 카드를 두 번 고르면 거부');
  check(!validateSubmission(st, 'p1', ['move_up', 'move_down', 'c2_a']).ok, '손패에 없는 카드(다른 캐릭터 기술)는 거부');
  check(!validateSubmission(st, 'p1', ['c1_b', 'c1_c', 'c1_d']).ok, '기력이 모자란 조합은 거부 (55 + 35 + 35 > 100)');
  check(validateSubmission(st, 'p1', ['c1_b', 'c1_c', 'move_up']).ok, '기력 안에 드는 조합은 허용');

  const low = battle('c1', 'c1');
  low.p1.en = 10;
  check(!validateSubmission(low, 'p1', ['c1_a', 'energy_up', 'move_up']).ok, '기력 10 에서 25 짜리를 먼저 내면 거부');
  check(validateSubmission(low, 'p1', ['energy_up', 'c1_a', 'move_up']).ok, 'Energy Up 을 먼저 내면 같은 세 장이 유효해짐 (가상 실행)');
}
{
  const st = battle('c1', 'c1');
  submitCards(st, 'p1', ['move_up', 'move_down', 'move_left']);
  let locked = false;
  try { submitCards(st, 'p1', ['move_up', 'move_down', 'move_right']); } catch { locked = true; }
  check(locked, '제출하면 잠기고 다시 낼 수 없음');
}

/* ═══════════════════════════ 자동 선택 ═══════════════════════════ */
section('자동 선택과 3연속 패배 (기준서 4번)');
{
  const st = battle('c1', 'c1');
  applySelectTimeout(st);
  check(st.p1.submission?.length === 3 && st.p1.submissionAuto, '마감 후 서버가 유효한 3장을 골라줌');
  check(new Set(st.p1.submission!).size === 3, '자동 선택도 서로 다른 3장');
  check(st.p1.autoPickStreak === 1 && st.p2.autoPickStreak === 1, '자동 선택 연속 횟수 증가');
}
{
  const st = battle('c1', 'c1');
  for (let i = 0; i < 3 && st.phase !== 'finished'; i++) {
    submitCards(st, 'p1', MOVES3);
    applySelectTimeout(st);
    if (st.phase === 'finished') break;
    resolveTurn(st);
    advanceAfterTurn(st, T0);
  }
  check(st.phase === 'finished' && st.result?.winner === 'p1' && st.result.reason === 'autoPick', '한쪽만 3연속 자동 선택 → 그쪽 패배');
}
{
  const st = battle('c1', 'c1');
  submitCards(st, 'p1', MOVES3);
  applySelectTimeout(st);
  resolveTurn(st); advanceAfterTurn(st, T0);
  check(st.p1.autoPickStreak === 0, '직접 낸 턴에는 연속 횟수가 0으로 돌아감');
}
{
  // AI 는 타임아웃 패배 규칙의 대상이 아니다
  const st = createBattle({ p1UserId: 'u1', p2UserId: null, now: T0 });
  chooseCharacter(st, 'p1', 'c1');
  chooseCharacter(st, 'p2', 'c1');
  revealCharacters(st); beginSelecting(st, T0);
  for (let i = 0; i < 4; i++) {
    submitCards(st, 'p1', MOVES3);
    applySelectTimeout(st);
    resolveTurn(st); advanceAfterTurn(st, T0);
  }
  check(st.p2.autoPickStreak === 0 && st.phase !== 'finished', 'AI 는 자동 선택 3연속 패배에 걸리지 않음');
}

/* ═══════════════════════════ 판 종료 ═══════════════════════════ */
section('판 종료 (기준서 7-1)');
{
  // EN 0 카드만 내는 판도 20턴에 끝난다 — 무한 루프 방지
  const st = battle('c1', 'c1');
  let turns = 0;
  while (st.phase !== 'finished' && turns < 40) {
    playTurn(st, ['energy_up', 'guard', 'move_up'], ['energy_up', 'guard', 'move_down']);
    turns++;
  }
  check(st.phase === 'finished' && turns === TURN_LIMIT, '양쪽이 기력 0 카드만 내도 20턴에 끝남');
  check(st.result?.reason === 'turnLimit' && st.result.winner === 'draw', 'HP 가 같으면 20턴 판정은 무승부');
}
{
  // 절대값과 비율이 갈리는 경우 — 비율이 높은 쪽이 이긴다
  const st = battle('c5', 'c3');          // c5 Max HP 190, c3 Max HP 205
  st.turn = TURN_LIMIT;
  st.p1.hp = 150;                          // 150 / 190 = 0.7895
  st.p2.hp = 160;                          // 160 / 205 = 0.7805
  playTurn(st, MOVES3, MOVES3);
  check(hpRatio(st.p1) > hpRatio(st.p2), '150/190 의 비율이 160/205 보다 높다');
  check(st.result?.winner === 'p1' && st.result.reason === 'turnLimit', '절대 HP 가 낮아도 비율이 높으면 승리');
}
{
  const st = battle('c1', 'c1');
  forfeit(st, 'p2');
  check(st.phase === 'finished' && st.result?.winner === 'p1' && st.result.reason === 'forfeit', '기권 → 상대 승리');
}

/* ═══════════════════════════ 결정성과 복구 ═══════════════════════════ */
section('결정성과 복구 (기준서 11-2)');
{
  const a = battle('c1', 'c5', 12345);
  const b = battle('c1', 'c5', 12345);
  const ra = randomSubmission(a, 'p1');
  const rb = randomSubmission(b, 'p1');
  check(JSON.stringify(ra) === JSON.stringify(rb), '같은 seed 면 자동 선택 결과가 같다');
}
{
  const st = battle('c7', 'c2', 777);
  place(st, { row: 1, col: 1 }, { row: 1, col: 1 });
  playTurn(st, ['c7_c', 'move_up', 'move_down'], ['guard', 'move_up', 'move_down']);
  const round = deserialize(serialize(st));
  check(JSON.stringify(round) === JSON.stringify(st), 'BattleState 는 JSON 직렬화 → 복원으로 그대로 돌아온다');
  const copy = cloneState(st);
  copy.p1.hp = 1;
  check(st.p1.hp !== 1, 'cloneState 는 깊은 복사');
}
{
  // 상대 패는 상태 안에만 있고, 공개 전에는 뷰가 내려보내지 않아야 한다.
  // 뷰(viewFor)는 2단계 session 의 일이므로 여기서는 "서버가 전부 알고 있다"만 확인한다.
  const st = battle('c1', 'c1');
  submitCards(st, 'p1', ['c1_a', 'move_up', 'move_down']);
  check(st.p2.submission === null, '상대가 내기 전에는 상대 제출이 비어 있음');
  submitCards(st, 'p2', ['guard', 'move_up', 'move_down']);
  const res = resolveTurn(st);
  check(st.reveal?.slot === 0 && res.length === 3, '해결 결과는 서버가 전부 갖고, 공개는 슬롯 0 부터 시작');
}

/* ═══════════════════════════ AI ═══════════════════════════ */
section('AI (기준서 10번)');

/** AI 대 AI 한 판. hardSide 쪽만 Hard 를 쓴다. */
function aiMatch(c1: string, c2: string, hardSide: Side, seed: number) {
  const st = createBattle({ p1UserId: null, p2UserId: null, now: T0, seed });
  chooseCharacter(st, 'p1', c1);
  chooseCharacter(st, 'p2', c2);
  revealCharacters(st);
  beginSelecting(st, T0);
  const history: Record<Side, string[]> = { p1: [], p2: [] };
  let guard = 0;
  while (st.phase !== 'finished' && guard++ < 60) {
    for (const side of ['p1', 'p2'] as const) {
      const ctx = aiContext(st, side, history[side === 'p1' ? 'p2' : 'p1']);
      submitCards(st, side, side === hardSide ? hardPick(ctx) : normalPick(ctx));
    }
    for (const r of resolveTurn(st)) { history.p1.push(r.cards.p1); history.p2.push(r.cards.p2); }
    advanceAfterTurn(st, T0);
  }
  return { result: st.result, turns: st.turn };
}

{
  // 입력에 상대의 이번 턴 제출이 들어갈 자리 자체가 없어야 한다
  const st = battle('c1', 'c5');
  submitCards(st, 'p1', ['c1_a', 'c1_b', 'move_up']);
  const ctx = aiContext(st, 'p2', []);
  const json = JSON.stringify(ctx);
  check(!json.includes('c1_a') && !json.includes('c1_b'), 'AI 입력에 상대의 미공개 제출이 없음');
  check(!('submission' in (ctx.foe as object)), 'AI 입력의 상대 자리에 제출 필드가 아예 없음');
  check(ctx.hand.length === 14 && ctx.foe.characterId === 'c1', 'AI 는 자기 손패와 공개된 상대 캐릭터는 본다');
}
{
  // 어떤 상태에서도 합법적인 3장을 내야 한다
  let ok = true;
  for (let i = 0; i < 40; i++) {
    const st = battle(`c${(i % 8) + 1}`, `c${((i + 3) % 8) + 1}`, i + 1);
    st.p1.en = i % 3 === 0 ? 0 : (i * 7) % 110;
    place(st, { row: i % 3, col: i % 4 }, { row: (i + 1) % 3, col: (i + 2) % 4 });
    for (const pick of [normalPick(aiContext(st, 'p1', [])), hardPick(aiContext(st, 'p1', []))]) {
      if (!validateSubmission(st, 'p1', pick).ok) { ok = false; break; }
    }
    if (!ok) break;
  }
  check(ok, 'Normal / Hard 둘 다 어떤 상태에서도 합법적인 3장을 낸다 (기력 0 포함)');
}
{
  // 닿으면 때린다 / 멀면 다가간다
  const near = battle('c1', 'c1');
  place(near, { row: 1, col: 1 }, { row: 1, col: 2 });
  const p1 = normalPick(aiContext(near, 'p1', []));
  check(p1.some((id) => id.startsWith('c1_')), 'Normal: 사거리 안이면 기술을 낸다');

  const far = battle('c1', 'c1');
  place(far, { row: 0, col: 0 }, { row: 2, col: 3 });
  const p2 = normalPick(aiContext(far, 'p1', []));
  check(p2.some((id) => id.startsWith('move_')), 'Normal: 멀면 다가간다');
}
{
  const { result } = aiMatch('c1', 'c5', 'p1', 7);
  check(result !== null, 'AI 대 AI 판이 끝까지 간다');
}
{
  // Hard 가 Normal 을 이기는 편이어야 한다. 양쪽 자리를 바꿔가며 돌려 자리 유불리를 지운다.
  let hardWins = 0, normalWins = 0, draws = 0;
  for (let i = 0; i < 48; i++) {
    const c1 = `c${(i % 8) + 1}`, c2 = `c${((i + 4) % 8) + 1}`;
    const hardSide: Side = i % 2 === 0 ? 'p1' : 'p2';
    const { result } = aiMatch(c1, c2, hardSide, 1000 + i);
    if (!result || result.winner === 'draw') draws++;
    else if (result.winner === hardSide) hardWins++;
    else normalWins++;
  }
  console.log(`     (Hard ${hardWins} / Normal ${normalWins} / 무승부 ${draws})`);
  check(hardWins > normalWins, 'Hard 가 Normal 보다 많이 이긴다');
}

console.log(failures ? `\n실패 ${failures}건` : '\n카드 대전 엔진 테스트 모두 통과');
process.exit(failures ? 1 : 0);
