import { useEffect, useState } from 'preact/hooks';
import { EXTEND_COOLDOWN_MS } from '@shared/mm/view';
import { act, useNow, view } from './util';
import { sfx, timerTick } from '../../audio/sfx';
import { fmtTime } from '../../ui/common';

const KIND_LABEL: Record<string, string> = { discussion: '토론', interrogation: '심문·밀담', vote: '투표' };

/** 상단 진행 표시판: 지금 몇 번째 단계인지, 무엇을 할 수 있는지, 남은 시간, 연장/확인 */
export function PhaseBar(props: { unopenedCount: number; onOpenMail: () => void }) {
  const v = view();
  const now = useNow(200);
  const step = v.step;
  const [collapsed, setCollapsed] = useState(false);
  const remaining = step?.endsAt ? step.endsAt - now : null;
  useEffect(() => { if (remaining !== null && remaining > 0 && step?.advance !== 'allReady') timerTick(remaining / 1000); }, [Math.ceil((remaining ?? 0) / 1000)]);
  if (!step) return null;

  const participant = v.me.participant;
  const myReady = !!v.participants.find((p) => p.userId === v.me.userId)?.ready;
  const readyCount = v.participants.filter((p) => p.ready || p.absent).length;
  const total = v.participants.length;
  const myStepItems = v.items.filter((i) => step.myItemKeys.includes(i.key));
  const unopenedInStep = myStepItems.filter((i) => !i.opened).length;
  const cooldown = Math.max(0, v.extend.cooldownUntil - now);
  const waitingFor = v.participants.filter((p) => !p.connected && !p.absent);
  const isVote = step.kind === 'vote';
  const hasTimer = step.endsAt !== null;
  const over = remaining !== null && remaining < 0;
  const pct = hasTimer && step.durationSec ? Math.max(0, Math.min(1, (remaining ?? 0) / ((step.endsAt! - step.startedAt) || 1))) : 0;

  let hint = '';
  if (step.type === 'reveal') hint = unopenedInStep ? `📩 새 자료 ${unopenedInStep}개가 도착했습니다 — 봉투를 열어 확인하세요` : '자료를 모두 확인했습니다. 준비되면 “확인 완료”를 누르세요';
  else if (isVote) hint = '지목 도장을 용의자 카드 위에 찍고, 도장을 길게 눌러 확정하세요';
  else if (step.zonesOpen) hint = step.kind === 'interrogation' ? '밀담 구역에서 둘만 추궁할 수 있습니다 · 능력 카드를 위로 끌어 사용하세요' : '밀담 구역이 열렸습니다 — 함께 들어가면 구역 안에서만 대화가 들립니다';
  else hint = '지금은 밀담 구역이 닫혀 있습니다 — 모두 함께 이야기하세요';
  if (!participant) hint = '관전 중입니다';

  const advanceText = step.advance === 'allReady' ? '전원 확인 시 진행' : step.advance === 'timer' ? '타이머 종료 시 진행' : step.advance === 'either' ? '타이머 종료 또는 전원 확인 시 진행' : '곧 진행';

  return (
    <div class={`phase-bar ${collapsed ? 'collapsed' : ''} ${step.type} ${step.kind ?? ''}`}>
      <div class="phase-plaque">
        <div class="phase-track">
          {v.outline.map((o) => (
            <span key={o.index} class={`dot ${o.type} ${o.kind ?? ''} ${o.index < step.index ? 'done' : o.index === step.index ? 'now' : ''}`} title={o.index <= step.index ? `${o.index + 1}. ${o.title}` : `${o.index + 1}. ???`} />
          ))}
        </div>
        <div class="phase-main">
          <div class="phase-title">
            <span class={`kind chip ${step.type === 'reveal' ? 'gold' : isVote ? 'red' : 'green'}`}>{step.type === 'reveal' ? '정보 공개' : KIND_LABEL[step.kind ?? ''] ?? '페이즈'}</span>
            <span class="mono faint">{step.index + 1}/{step.total}</span>
            <b class="serif">{step.title}</b>
            <span class={`chip tiny ${step.zonesOpen ? 'gold' : ''}`}>{step.zonesOpen ? '🔒 밀담 가능' : '밀담 불가'}</span>
            <button class="collapse btn ghost sm" onClick={() => setCollapsed(!collapsed)} aria-label="접기">{collapsed ? '▾' : '▴'}</button>
          </div>
          {!collapsed && (
            <>
              {step.note && <div class="phase-note serif">{step.note}</div>}
              <div class="phase-hint pixel">{hint}</div>
              {waitingFor.length > 0 && <div class="phase-wait pixel">⏳ {waitingFor.map((p) => p.nickname).join(', ')}님의 재접속을 기다리는 중…</div>}
            </>
          )}
        </div>
        <div class="phase-side">
          {hasTimer && (
            <div class={`timer ${over ? 'over' : remaining !== null && remaining < 30000 ? 'low' : ''}`}>
              <svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19" class="track" /><circle cx="22" cy="22" r="19" class="fill" style={{ strokeDashoffset: `${119.4 * (1 - pct)}` }} /></svg>
              <div class="time mono">{over ? `+${fmtTime(-remaining!)}` : fmtTime(remaining ?? 0)}</div>
            </div>
          )}
          {participant && hasTimer && (
            <button class="btn sm extend" disabled={cooldown > 0} onClick={() => act('extend').then((ok) => ok && sfx.whoosh())} title="누구나 연장할 수 있습니다 (연장 후 10초 쿨타임)">
              <span class="cool" style={{ width: `${(cooldown / EXTEND_COOLDOWN_MS) * 100}%` }} />
              ⏳ +{step.extendSec >= 60 ? `${Math.round((step.extendSec / 60) * 10) / 10}분` : `${step.extendSec}초`}
            </button>
          )}
        </div>
      </div>
      {!collapsed && (
        <div class="phase-actions">
          <span class="faint tiny pixel">{advanceText}</span>
          <div class="ready-dots">
            {v.participants.map((p) => {
              const c = v.people.find((x) => x.id === p.charId);
              return <span key={p.userId} class={`rdot ${p.ready ? 'on' : ''} ${p.absent ? 'absent' : ''} ${!p.connected ? 'off' : ''}`} title={`${c?.name ?? p.nickname}${p.absent ? ' (부재)' : !p.connected ? ' (연결 끊김)' : p.ready ? ' — 확인' : ''}`}>{(c?.name ?? p.nickname).slice(0, 3)}</span>;
            })}
          </div>
          {participant && step.advance !== 'timer' && step.advance !== 'immediate' && !isVote && (
            step.type === 'reveal' && unopenedInStep > 0
              ? <button class="btn gold sm pulse" onClick={props.onOpenMail}>📩 봉투 열기 ({myStepItems.length - unopenedInStep}/{myStepItems.length})</button>
              : <button class={`btn sm ${myReady ? '' : 'gold'}`} onClick={() => act('ready', { ready: !myReady }).then((ok) => ok && (myReady ? sfx.click() : sfx.stamp()))}>
                {myReady ? `✓ 확인함 (${readyCount}/${total}) · 취소` : step.type === 'reveal' ? `확인 완료 (${readyCount}/${total})` : `다음 단계로 넘어가기 (${readyCount}/${total})`}
              </button>
          )}
          {isVote && <span class="chip red">투표 확정 {v.vote?.confirmedCount ?? 0}/{v.vote?.eligibleCount ?? 0}</span>}
          {step.advanceAt && <span class="advancing pixel">곧 다음 단계로 넘어갑니다…</span>}
        </div>
      )}
      {props.unopenedCount > 0 && step.type !== 'reveal' && <div />}
    </div>
  );
}
