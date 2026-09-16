import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import '../styles/base.css';
import '../styles/mm.css';
import './editor.css';
import { api, dirty, draft, newScenarioTemplate, savedJson, tab, token, validation } from './state';
import { BasicTab, CharactersTab, SuspectsTab } from './tabsPeople';
import { CommonTab, CluesTab } from './tabsContent';
import { EndingTab, FlowTab, ZonesTab } from './tabsFlow';
import type { Scenario } from '@shared/mm/scenario';

interface ListItem { id: string; title: string; errors: number; warnings: number; published: boolean; updatedAt: number }

const TABS: [string, string][] = [
  ['basic', '기본 정보'], ['characters', '캐릭터 · 설정집 · 카드'], ['suspects', 'NPC 용의자'], ['common', '공용집'], ['clues', '단서/증거'],
  ['flow', '진행 흐름'], ['zones', '밀담 구역'], ['ending', '엔딩 · 투표'],
];
const tabOfPath = (p: string) => {
  const k = p.split('.')[0];
  return ({ characters: 'characters', sheetPages: 'characters', suspects: 'suspects', commonEntries: 'common', clues: 'clues', flow: 'flow', zones: 'zones', ending: 'ending' } as Record<string, string>)[k] ?? 'basic';
};

function Login() {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const submit = async (e: Event) => {
    e.preventDefault();
    const r = await api('/login', { method: 'POST', body: JSON.stringify({ password: pw }) });
    if (!r.ok) { setErr(r.error); return; }
    sessionStorage.setItem('midnight.admin', r.token);
    token.value = r.token;
  };
  return (
    <div class="ed-login">
      <form class="panel" onSubmit={submit}>
        <h2 class="pixel">🗝 운영자 전용 · 시나리오 에디터</h2>
        <p class="dim small">일반 참가자 세션과 분리된 운영자 비밀번호로만 들어올 수 있습니다. (서버 환경변수 ADMIN_PASSWORD)</p>
        <input class="input" type="password" placeholder="운영자 비밀번호" value={pw} autoFocus onInput={(e) => setPw((e.target as HTMLInputElement).value)} />
        {err && <div class="form-error">{err}</div>}
        <button class="btn gold" type="submit">들어가기</button>
        <a class="dim small" href="/">← 게임으로 돌아가기</a>
      </form>
    </div>
  );
}

function Editor() {
  const [list, setList] = useState<ListItem[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const [showIssues, setShowIssues] = useState(false);

  const refresh = async () => { const r = await api('/scenarios'); if (r.ok) setList(r.scenarios); };
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); save(); } };
    const before = (e: BeforeUnloadEvent) => { if (dirty.value) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('keydown', k); window.addEventListener('beforeunload', before);
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('beforeunload', before); };
  });

  const open = async (id: string) => {
    if (dirty.value && !confirm('저장하지 않은 변경 사항이 있습니다. 버릴까요?')) return;
    const r = await api(`/scenarios/${encodeURIComponent(id)}`);
    if (!r.ok) { alert(r.error); return; }
    draft.value = r.raw as Scenario;
    savedJson.value = JSON.stringify(r.raw);
    setCurrent(id);
    tab.value = 'basic';
  };
  const create = (base?: Scenario) => {
    if (dirty.value && !confirm('저장하지 않은 변경 사항이 있습니다. 버릴까요?')) return;
    const s = base ? { ...structuredClone(base), id: `${base.id}-copy`, title: `${base.title} (복사본)`, published: false } : newScenarioTemplate();
    draft.value = s; savedJson.value = ''; setCurrent(null); tab.value = 'basic';
  };
  async function save() {
    const d = draft.value;
    if (!d) return;
    setStatus('저장 중…');
    const r = await api(`/scenarios/${encodeURIComponent(d.id)}`, { method: 'PUT', body: JSON.stringify(d) });
    if (!r.ok) { setStatus(`저장 실패: ${r.error}`); return; }
    if (current && current !== d.id && confirm(`ID가 '${current}' → '${d.id}' 로 바뀌었습니다. 이전 파일을 지울까요?`)) await api(`/scenarios/${encodeURIComponent(current)}`, { method: 'DELETE' });
    savedJson.value = JSON.stringify(d);
    setCurrent(d.id);
    const errors = (r.issues as { level: string }[]).filter((i) => i.level === 'error').length;
    setStatus(errors ? `저장됨 — 오류 ${errors}건이 있어 아직 플레이할 수 없습니다` : d.published ? '저장됨 — 게임 선반에 바로 반영되었습니다' : '저장됨 (비공개)');
    refresh();
  }
  const remove = async () => {
    if (!current || !confirm(`'${current}' 시나리오를 삭제할까요? 되돌릴 수 없습니다.`)) return;
    await api(`/scenarios/${encodeURIComponent(current)}`, { method: 'DELETE' });
    draft.value = null; setCurrent(null); refresh();
  };

  const issues = validation.value.issues;
  const errors = issues.filter((i) => i.level === 'error');
  const warns = issues.filter((i) => i.level === 'warn');
  const d = draft.value;

  return (
    <div class="ed-shell">
      <aside class="ed-side">
        <div class="ed-brand pixel">🕯️ 시나리오 에디터</div>
        <button class="btn gold sm" onClick={() => create()}>＋ 새 시나리오</button>
        <ul class="ed-list">
          {list.map((s) => (
            <li key={s.id} class={current === s.id ? 'on' : ''} onClick={() => open(s.id)}>
              <b>{s.title}</b>
              <span class="small dim mono">{s.id}</span>
              <span class="row small">
                {s.published ? <i class="ok">공개</i> : <i>비공개</i>}
                {s.errors > 0 && <i class="err">오류 {s.errors}</i>}
                {s.warnings > 0 && <i class="warn">경고 {s.warnings}</i>}
              </span>
            </li>
          ))}
        </ul>
        <div class="ed-side-foot small dim">
          <a href="/" target="_blank">게임 열기 ↗</a>
          <button class="ed-btn sm ghost" onClick={() => { sessionStorage.removeItem('midnight.admin'); token.value = null; }}>로그아웃</button>
        </div>
      </aside>
      <main class="ed-main">
        {!d && <div class="ed-empty"><h2 class="serif">시나리오를 고르거나 새로 만드세요</h2><p class="dim">저장하면 서버 재시작이나 코드 수정 없이 바로 게임 선반에 올라갑니다.</p></div>}
        {d && (
          <>
            <div class="ed-top">
              <div class="grow">
                <h1 class="serif">{d.title || '(제목 없음)'}{dirty.value && <span class="dirty"> ● 저장 안 됨</span>}</h1>
                <div class="small dim">{status}</div>
              </div>
              <button class="btn sm ghost" onClick={() => create(d)}>복제</button>
              {current && <button class="btn sm ghost" onClick={remove}>삭제</button>}
              <button class={`btn ${errors.length ? '' : 'gold'}`} onClick={save}>저장 (Ctrl+S)</button>
            </div>
            <nav class="ed-tabs">
              {TABS.map(([k, label]) => {
                const n = issues.filter((i) => i.level === 'error' && tabOfPath(i.path) === k).length;
                return <button key={k} class={tab.value === k ? 'on' : ''} onClick={() => (tab.value = k)}>{label}{n > 0 && <b class="err-dot">{n}</b>}</button>;
              })}
            </nav>
            <div class="ed-content">
              {tab.value === 'basic' && <BasicTab />}
              {tab.value === 'characters' && <CharactersTab />}
              {tab.value === 'suspects' && <SuspectsTab />}
              {tab.value === 'common' && <CommonTab />}
              {tab.value === 'clues' && <CluesTab />}
              {tab.value === 'flow' && <FlowTab />}
              {tab.value === 'zones' && <ZonesTab />}
              {tab.value === 'ending' && <EndingTab />}
            </div>
            <div class={`ed-issues ${showIssues ? '' : 'min'} ${errors.length ? 'has-err' : ''}`}>
              <button class="head" onClick={() => setShowIssues(!showIssues)}>
                {errors.length ? `⛔ 오류 ${errors.length}` : '✅ 플레이 가능'} · ⚠ 경고 {warns.length} {showIssues ? '▾' : '▴'}
              </button>
              {(showIssues || errors.length > 0) && (
                <ul>
                  {[...errors, ...warns].map((i, k) => <li key={k} class={i.level} onClick={() => (tab.value = tabOfPath(i.path))}><span class="mono dim">{i.path || '-'}</span> {i.message}</li>)}
                  {issues.length === 0 && <li class="ok">문제가 없습니다.</li>}
                </ul>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function App() { return token.value ? <Editor /> : <Login />; }
render(<App />, document.getElementById('app')!);
