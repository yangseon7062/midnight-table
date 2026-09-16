import { useEffect, useMemo, useState } from 'preact/hooks';
import type { MMItemView } from '@shared/mm/view';
import { bus, toast } from '../../net/net';
import { sfx } from '../../audio/sfx';
import { view } from './util';
import { Casting } from './Casting';
import { PhaseBar } from './PhaseBar';
import { Mailbox, EnvelopeOpener, type Bundle } from './Envelope';
import { Dossier } from './Dossier';
import { EvidenceBoard, EvidenceViewer } from './Evidence';
import { CardHand, CardSpotlight } from './Cards';
import { VoteBoard } from './Vote';
import { Ending } from './Ending';

type Panel = { kind: 'none' } | { kind: 'envelope'; stepIndex: number } | { kind: 'dossier'; key?: string } | { kind: 'evidence' } | { kind: 'viewer'; key: string } | { kind: 'log' };

export function MMGame(props: { engine: { tableItems: number; inputBlocked: () => boolean } | null }) {
  const v = view();
  const [panel, setPanel] = useState<Panel>({ kind: 'none' });
  const [transition, setTransition] = useState<{ index: number; title: string; stepType: string; kind: string | null; received: number } | null>(null);
  const [voteMin, setVoteMin] = useState(false);
  const [endingMin, setEndingMin] = useState(false);

  const bundles: Bundle[] = useMemo(() => {
    const map = new Map<number, Bundle>();
    for (const it of v.items) {
      const b = map.get(it.stepIndex) ?? { stepIndex: it.stepIndex, title: v.outline[it.stepIndex]?.title ?? '자료', items: [] };
      b.items.push(it);
      map.set(it.stepIndex, b);
    }
    return [...map.values()].sort((a, b) => a.stepIndex - b.stepIndex);
  }, [v.items, v.outline]);

  useEffect(() => {
    const offs = [
      bus.on('g:step', (p) => { setTransition(p); sfx.bell(); setVoteMin(false); }),
      bus.on('g:extend', (p: { by: string; sec: number }) => { toast(`⏳ ${p.by}이(가) 시간을 연장했습니다`); }),
      bus.on('g:castStart', () => sfx.bell()),
      bus.on('g:ending', () => { setEndingMin(false); setPanel({ kind: 'none' }); }),
    ];
    return () => offs.forEach((o) => o());
  }, []);
  useEffect(() => {
    if (!transition) return;
    const t = setTimeout(() => setTransition(null), 2600);
    return () => clearTimeout(t);
  }, [transition]);

  useEffect(() => { if (props.engine) (props.engine as any).camLift = v.stage === 'flow' ? 40 : 0; }, [v.stage, props.engine]);

  // 테이블 위에 공개 자료가 쌓이는 모습 (월드)
  useEffect(() => {
    if (props.engine) props.engine.tableItems = Math.min(8, v.items.filter((i) => i.kind === 'common' || i.clue?.scope === 'public').length);
  }, [v.items.length, props.engine]);

  const isVote = v.stage === 'flow' && v.step?.kind === 'vote' && v.me.participant;
  const blocking = panel.kind !== 'none' || v.stage === 'casting' || (isVote && !voteMin) || (v.stage === 'ending' && !endingMin);
  useEffect(() => {
    if (!props.engine) return;
    props.engine.inputBlocked = () => blocking;
  }, [blocking, props.engine]);

  if (v.stage === 'casting') return <><Casting /></>;

  const clues = v.items.filter((i) => i.kind === 'clue' && i.opened);
  const docs = v.items.filter((i) => i.kind !== 'clue');
  const unopened = v.items.filter((i) => !i.opened).length;
  const unopenedDocs = docs.filter((i) => !i.opened).length;
  const unopenedClues = v.items.filter((i) => i.kind === 'clue' && !i.opened).length;
  const viewing = panel.kind === 'viewer' ? v.items.find((i) => i.key === panel.key) : null;
  const scenarioInitial = v.scenario.title[0];

  const openItem = (it: MMItemView) => {
    if (it.kind === 'clue') setPanel({ kind: 'viewer', key: it.key });
    else setPanel({ kind: 'dossier', key: it.key });
  };
  const openMail = () => {
    const pending = bundles.filter((b) => b.items.some((i) => !i.opened));
    const target = pending.find((b) => b.stepIndex === v.step?.index) ?? pending[pending.length - 1];
    if (target) setPanel({ kind: 'envelope', stepIndex: target.stepIndex });
  };

  return (
    <>
      {v.stage === 'flow' && <PhaseBar unopenedCount={unopened} onOpenMail={openMail} />}

      {v.me.participant && (
        <div class="case-rail">
          <button class="rail-btn" onClick={() => { setPanel({ kind: 'dossier' }); }} title="설정집·공용집">
            <span class="ico">📜</span><span class="pixel tiny">사건 파일</span>
            {unopenedDocs > 0 && <b class="badge">{unopenedDocs}</b>}
          </button>
          <button class="rail-btn" onClick={() => setPanel({ kind: 'evidence' })} title="단서 보드">
            <span class="ico">🔎</span><span class="pixel tiny">단서 {clues.length}</span>
            {unopenedClues > 0 && <b class="badge">{unopenedClues}</b>}
          </button>
          <button class="rail-btn" onClick={() => setPanel({ kind: 'log' })} title="진행 기록">
            <span class="ico">🕰</span><span class="pixel tiny">기록</span>
          </button>
          <div class="my-role">
            <span class="tiny faint pixel">내 인물</span>
            <b class="serif">{v.people.find((p) => p.id === v.me.charId)?.name}</b>
          </div>
        </div>
      )}

      {v.stage === 'flow' && v.me.participant && <Mailbox bundles={bundles} onOpen={(b) => setPanel({ kind: 'envelope', stepIndex: b.stepIndex })} />}
      {v.stage === 'flow' && v.me.participant && <CardHand />}

      {panel.kind === 'envelope' && (() => {
        const b = bundles.find((x) => x.stepIndex === panel.stepIndex);
        return b ? <EnvelopeOpener bundle={b} scenarioInitial={scenarioInitial} onClose={() => setPanel({ kind: 'none' })} onRead={openItem} /> : null;
      })()}
      {panel.kind === 'dossier' && <Dossier initialKey={panel.key} onClose={() => setPanel({ kind: 'none' })} />}
      {panel.kind === 'evidence' && <EvidenceBoard onClose={() => setPanel({ kind: 'none' })} onView={(it) => { if (!it.opened) { toast('봉투를 먼저 열어 카드를 뒤집어 주세요', 'warn'); openMail(); return; } setPanel({ kind: 'viewer', key: it.key }); }} />}
      {viewing && (() => {
        const idx = clues.findIndex((c) => c.key === viewing.key);
        return <EvidenceViewer item={viewing} onClose={() => setPanel({ kind: 'evidence' })}
          onPrev={idx > 0 ? () => { setPanel({ kind: 'viewer', key: clues[idx - 1].key }); sfx.cardFlip(); } : undefined}
          onNext={idx >= 0 && idx < clues.length - 1 ? () => { setPanel({ kind: 'viewer', key: clues[idx + 1].key }); sfx.cardFlip(); } : undefined} />;
      })()}
      {panel.kind === 'log' && (
        <div class="dossier-back" onPointerDown={(e) => { if (e.target === e.currentTarget) setPanel({ kind: 'none' }); }}>
          <div class="panel log-panel">
            <div class="row" style={{ justifyContent: 'space-between' }}><h3 class="pixel">🕰 진행 기록</h3><button class="btn ghost sm" onClick={() => setPanel({ kind: 'none' })}>닫기</button></div>
            <ol class="log-list">
              {v.log.map((l, i) => <li key={i} class={l.kind}><span class="mono faint">{new Date(l.at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}</span> {l.text}</li>)}
            </ol>
          </div>
        </div>
      )}

      {isVote && v.vote && <VoteBoard minimized={voteMin} onToggle={() => setVoteMin(!voteMin)} />}
      {v.stage === 'ending' && v.ending && <Ending minimized={endingMin} onToggle={() => setEndingMin(!endingMin)} />}

      <CardSpotlight />

      {transition && (
        <div class="step-transition" onClick={() => setTransition(null)}>
          <div class="st-band">
            <div class="st-num mono">{String(transition.index + 1).padStart(2, '0')}</div>
            <div>
              <div class="st-kind pixel">{transition.stepType === 'reveal' ? '정보 공개' : transition.kind === 'vote' ? '최종 투표' : transition.kind === 'interrogation' ? '심문 · 밀담' : '토론'}</div>
              <div class="st-title serif">{transition.title}</div>
              {transition.received > 0 && <div class="st-sub pixel">📩 봉투가 도착했습니다 — 자료 {transition.received}개</div>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
