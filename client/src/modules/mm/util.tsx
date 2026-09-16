import { useEffect, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import type { MMPersonPublic, MMView } from '@shared/mm/view';
import { call, gameView, serverNow, toast } from '../../net/net';
import { sfx } from '../../audio/sfx';

export const view = () => gameView.value as MMView;

export async function act(type: string, payload?: unknown, quiet = false): Promise<boolean> {
  const r = await call('g:action', { type, payload });
  if (!r.ok) { if (!quiet) { toast(r.error, 'warn'); sfx.error(); } return false; }
  return true;
}

export function useNow(interval = 250) {
  const [now, setNow] = useState(serverNow());
  useEffect(() => { const t = setInterval(() => setNow(serverNow()), interval); return () => clearInterval(t); }, [interval]);
  return now;
}

export function hashStr(s: string) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

/** 인물 초상: 누아르 실루엣 (시나리오에 초상 이미지가 있으면 그것을 사용) */
export function Portrait(props: { person: Pick<MMPersonPublic, 'id' | 'name' | 'color' | 'portrait'>; size?: number; class?: string }) {
  const { person } = props;
  if (person.portrait) return <img class={`portrait ${props.class ?? ''}`} src={person.portrait} alt={person.name} style={{ width: props.size, height: props.size ? props.size * 1.25 : undefined }} />;
  const h = hashStr(person.id);
  const hair = h % 5, collar = (h >> 3) % 3, glasses = (h >> 5) % 4 === 0;
  const id = `pg${h}`;
  return (
    <svg class={`portrait ${props.class ?? ''}`} viewBox="0 0 100 125" preserveAspectRatio="xMidYMid slice" style={{ width: props.size, height: props.size ? props.size * 1.25 : undefined }} role="img" aria-label={person.name}>
      <defs>
        <radialGradient id={`${id}b`} cx="0.5" cy="0.35" r="0.8"><stop offset="0" stop-color={person.color} stop-opacity="0.95" /><stop offset="1" stop-color="#0c0a0e" /></radialGradient>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1a1418" /><stop offset="1" stop-color="#070508" /></linearGradient>
      </defs>
      <rect width="100" height="125" fill={`url(#${id}b)`} />
      <text x="50" y="72" text-anchor="middle" font-family="Nanum Myeongjo, serif" font-size="70" fill="rgba(255,255,255,0.07)" font-weight="800">{person.name[0]}</text>
      <g fill={`url(#${id}s)`}>
        <path d={collar === 0 ? 'M8 125 Q12 92 50 88 Q88 92 92 125Z' : collar === 1 ? 'M4 125 Q10 90 34 86 L50 104 L66 86 Q90 90 96 125Z' : 'M10 125 Q14 96 38 90 L50 96 L62 90 Q86 96 90 125Z'} />
        <rect x="42" y="70" width="16" height="22" rx="6" />
        <ellipse cx="50" cy="54" rx="19" ry="23" />
        {hair === 0 && <path d="M30 50 Q30 26 50 26 Q72 26 70 50 Q64 36 50 36 Q38 36 30 50Z" />}
        {hair === 1 && <path d="M28 70 Q22 30 50 26 Q78 28 72 70 Q70 44 50 38 Q30 44 28 70Z" />}
        {hair === 2 && <><path d="M22 42 H78 L74 38 H26Z" /><path d="M34 38 Q36 18 50 18 Q64 18 66 38Z" /></>}
        {hair === 3 && <path d="M29 56 Q24 24 50 22 Q76 24 71 56 Q72 40 62 34 Q50 42 36 34 Q28 42 29 56Z" />}
        {hair === 4 && <path d="M31 46 Q33 24 52 25 Q70 27 69 46 Q60 33 45 35 Z" />}
      </g>
      {glasses && <g stroke="rgba(217,179,108,0.55)" stroke-width="1.5" fill="none"><circle cx="42" cy="55" r="5" /><circle cx="58" cy="55" r="5" /><path d="M47 55 H53" /></g>}
      <rect width="100" height="125" fill="none" stroke="rgba(0,0,0,0.5)" stroke-width="4" />
    </svg>
  );
}

/** 설정집/단서 본문 마크업: # 제목, ## 소제목, > 인용, - 목록, !! 비밀, **굵게** */
export function RichText(props: { text: string; class?: string }) {
  const lines = props.text.replace(/\r/g, '').split('\n');
  const out: ComponentChildren[] = [];
  let list: string[] = [];
  let para: string[] = [];
  const flushList = () => { if (list.length) { out.push(<ul>{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>); list = []; } };
  const flushPara = () => { if (para.length) { out.push(<p>{para.flatMap((l, i) => (i ? [<br />, inline(l)] : [inline(l)]))}</p>); para = []; } };
  for (const raw of lines) {
    const line = raw.trimEnd();
    const indent = /^\s{2,}- /.test(raw);
    if (!line.trim()) { flushList(); flushPara(); continue; }
    if (line.startsWith('# ')) { flushList(); flushPara(); out.push(<h2>{inline(line.slice(2))}</h2>); continue; }
    if (line.startsWith('## ')) { flushList(); flushPara(); out.push(<h3>{inline(line.slice(3))}</h3>); continue; }
    if (line.startsWith('> ')) { flushList(); flushPara(); out.push(<blockquote>{inline(line.slice(2))}</blockquote>); continue; }
    if (line.startsWith('!! ')) { flushList(); flushPara(); out.push(<div class="secret"><span class="secret-tag">비밀</span>{inline(line.slice(3))}</div>); continue; }
    if (line.trimStart().startsWith('- ') || line.trimStart().startsWith('• ')) { flushPara(); list.push((indent ? '　' : '') + line.trimStart().slice(2)); continue; }
    flushList();
    para.push(line);
  }
  flushList(); flushPara();
  return <div class={`rich ${props.class ?? ''}`}>{out}</div>;
}

function inline(s: string): ComponentChildren {
  const parts = s.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => (p.startsWith('**') && p.endsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p));
}

export function personById(v: MMView, id: string) { return v.people.find((p) => p.id === id); }
