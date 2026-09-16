import { readdirSync, readFileSync, mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { validateScenario, type Scenario, type ScenarioIssue } from '../../../../shared/mm/scenario';
import { writeJsonAtomic } from '../../platform/util';

export interface StoredScenario {
  id: string;
  raw: unknown;
  scenario: Scenario | null;
  issues: ScenarioIssue[];
  updatedAt: number;
}

/** 시나리오 JSON 파일 저장소. 에디터 저장 즉시 반영된다 (코드 수정/재시작 불필요). */
export class ScenarioStore {
  private items = new Map<string, StoredScenario>();
  constructor(private dir: string) {
    mkdirSync(dir, { recursive: true });
    this.reload();
  }

  reload() {
    this.items.clear();
    for (const f of readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const raw = JSON.parse(readFileSync(join(this.dir, f), 'utf8'));
        const { scenario, issues } = validateScenario(raw);
        const id = (raw as { id?: string }).id ?? f.replace(/\.json$/, '');
        this.items.set(id, { id, raw, scenario, issues, updatedAt: Date.now() });
        const errors = issues.filter((i) => i.level === 'error');
        console.log(`[scenario] ${id}: ${errors.length ? `오류 ${errors.length}건 (플레이 불가)` : '로드 완료'}`);
        errors.slice(0, 5).forEach((e) => console.log(`   - ${e.path}: ${e.message}`));
      } catch (e) {
        console.warn('[scenario] 파일 읽기 실패', f, (e as Error).message);
      }
    }
  }

  list() { return [...this.items.values()]; }
  playable(): Scenario[] {
    return this.list().filter((s) => s.scenario && s.scenario.published && !s.issues.some((i) => i.level === 'error')).map((s) => s.scenario!);
  }
  getPlayable(id: string): Scenario | null { return this.playable().find((s) => s.id === id) ?? null; }
  get(id: string) { return this.items.get(id) ?? null; }

  save(raw: unknown): StoredScenario {
    const id = (raw as { id?: unknown })?.id;
    if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(id)) throw new Error('시나리오 ID가 올바르지 않습니다 (영문/숫자/-/_)');
    const { scenario, issues } = validateScenario(raw);
    writeJsonAtomic(join(this.dir, `${id}.json`), raw);
    const entry = { id, raw, scenario, issues, updatedAt: Date.now() };
    this.items.set(id, entry);
    return entry;
  }

  remove(id: string) {
    const p = join(this.dir, `${id}.json`);
    if (existsSync(p)) unlinkSync(p);
    this.items.delete(id);
  }
}
