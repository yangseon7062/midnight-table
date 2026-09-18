import { useEffect, useRef, useState } from 'preact/hooks';
import { LIMITS, type ChatMessage } from '@shared/platform';
import { bus, call, chat, me, storage, toast, zones, members } from '../net/net';
import { voiceChannel } from '../audio/voice';
import { sfx } from '../audio/sfx';

/** 텍스트 채팅. 채널(공용 공간 / 밀담 구역)은 서버가 내 위치로 결정한다. */
type ChatFilter = 'all' | 'talk' | 'system';
const FILTERS: [ChatFilter, string][] = [['all', '전체'], ['talk', '대화'], ['system', '시스템']];

export function ChatPanel() {
  const [text, setText] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [filter, setFilter] = useState<ChatFilter>(() => storage.getPref<ChatFilter>('chatFilter', 'all'));
  const [unread, setUnread] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stick = useRef(true);
  const channel = voiceChannel.value;
  const zone = zones.value.find((z) => z.id === channel);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement as HTMLElement | null;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
      if (e.key === 'Enter' && !typing) { e.preventDefault(); setCollapsed(false); inputRef.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    const off = bus.on('chat', (m: ChatMessage) => {
      if (m.fromId && m.fromId !== me.value?.userId) sfx.msg();
      if (collapsedRef.current) setUnread((u) => u + 1);
    });
    return () => { window.removeEventListener('keydown', onKey); off(); };
  }, []);
  const collapsedRef = useRef(collapsed);
  collapsedRef.current = collapsed;

  useEffect(() => {
    const el = listRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [chat.value, collapsed, filter]);

  // 시스템 메시지는 진행 기록(🕰)에도 남으므로, 걸러내도 정보가 사라지지 않는다.
  const visible = chat.value.filter((m) => filter === 'all' || (filter === 'talk' ? m.kind === 'chat' : m.kind !== 'chat'));
  const hidden = chat.value.length - visible.length;
  const pick = (f: ChatFilter) => { setFilter(f); storage.setPref('chatFilter', f); stick.current = true; };

  const send = async (e: Event) => {
    e.preventDefault();
    const t = text.trim();
    if (!t) { inputRef.current?.blur(); return; }
    setText('');
    const r = await call('chat:send', { text: t });
    if (!r.ok) { toast(r.error, 'warn'); setText(t); }
  };

  const channelLabel = zone ? `🔒 ${zone.name} — 이 구역 안에서만 들립니다` : '📢 공용 공간 — 구역 밖 모두에게 들립니다';

  return (
    <div class={`chat panel ${collapsed ? 'collapsed' : ''} ${zone ? 'in-zone' : ''}`}>
      <button class="chat-head" onClick={() => { setCollapsed(!collapsed); setUnread(0); }}>
        <span class="pixel">{channelLabel}</span>
        <span class="faint">{collapsed ? (unread ? <b class="unread">{unread}</b> : '▲') : '▼'}</span>
      </button>
      {!collapsed && (
        <div class="chat-filter">
          {FILTERS.map(([f, label]) => (
            <button key={f} type="button" class={`cf ${filter === f ? 'on' : ''}`} onClick={() => pick(f)}>{label}</button>
          ))}
          {hidden > 0 && <span class="tiny faint">{hidden}개 숨김</span>}
        </div>
      )}
      {!collapsed && (
        <div class="chat-list" ref={listRef} onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30; }}>
          {visible.map((m) => <ChatLine key={m.id} m={m} />)}
          {visible.length === 0 && <div class="chat-line sys faint">{filter === 'talk' ? '아직 오간 대화가 없습니다' : '표시할 시스템 메시지가 없습니다'}</div>}
        </div>
      )}
      <form class="chat-input" onSubmit={send}>
        <input ref={inputRef} class="input" maxLength={LIMITS.chatMax} value={text} placeholder={zone ? `${zone.name}에서 속삭이기… (Enter)` : '모두에게 말하기… (Enter)'}
          onInput={(e) => setText((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => { if (e.key === 'Escape') (e.target as HTMLInputElement).blur(); e.stopPropagation(); }} />
      </form>
    </div>
  );
}

function ChatLine({ m }: { m: ChatMessage }) {
  const time = new Date(m.ts).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (m.kind !== 'chat') return <div class={`chat-line sys ${m.kind}`}><span class="faint mono">{time}</span> {m.text}</div>;
  const mine = m.fromId === me.value?.userId;
  const badge = m.fromId ? members.get(m.fromId)?.badge : null;
  return (
    <div class={`chat-line ${mine ? 'mine' : ''}`}>
      <span class="faint mono">{time}</span>
      {m.channel !== 'public' && <span class="chip gold tiny">{m.channelName}</span>}
      <b class="who">{badge ? `${badge}` : m.fromName}</b>
      {badge && <span class="faint tiny">({m.fromName})</span>}
      <span class="what">{m.text}</span>
    </div>
  );
}
