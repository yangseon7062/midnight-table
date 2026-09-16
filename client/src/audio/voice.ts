import { signal } from '@preact/signals';
import { bus, me, members, socket, toast } from '../net/net';
import { audioCtx, audioPrefs } from './sfx';

/**
 * 음성 채팅: WebRTC P2P 메시.
 * 서버가 알려주는 "같은 채널(공용 공간 or 같은 밀담 구역)" 피어하고만 연결한다.
 * 채널이 달라지면 즉시 연결을 끊고, 서버도 다른 채널 간 시그널 중계를 거부한다 → 구역 격리.
 * 마이크 on/off 는 replaceTrack 으로 재협상 없이 전환하고, 상태는 서버를 통해 모두에게 표시된다.
 */

let ICE: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
fetch('/api/config').then((r) => r.json()).then((c) => { if (Array.isArray(c.iceServers)) ICE = c.iceServers; }).catch(() => {});

interface Peer {
  id: string;
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  analyser: AnalyserNode | null;
  initiator: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  restartTimer: number | null;
}

export const micState = signal<'on' | 'off' | 'none'>('off');
export const voiceChannel = signal<string>('public');
export const voicePeers = signal<string[]>([]);
export const voiceStats = signal<Record<string, { state: string }>>({});

let localStream: MediaStream | null = null;
let localAnalyser: AnalyserNode | null = null;
const peers = new Map<string, Peer>();
let wanted = new Set<string>();

function localTrack(): MediaStreamTrack | null {
  return micState.value === 'on' ? localStream?.getAudioTracks()[0] ?? null : null;
}

function updateStats() {
  const s: Record<string, { state: string }> = {};
  for (const p of peers.values()) s[p.id] = { state: p.pc.connectionState };
  voiceStats.value = s;
}

function createPeer(id: string, initiator: boolean): Peer {
  const pc = new RTCPeerConnection({ iceServers: ICE });
  const audio = new Audio();
  audio.autoplay = true;
  audio.volume = audioPrefs.voice;
  const peer: Peer = { id, pc, audio, analyser: null, initiator, pendingCandidates: [], restartTimer: null };
  peers.set(id, peer);

  pc.onicecandidate = (e) => { if (e.candidate) socket.emit('v:signal', { to: id, data: { candidate: e.candidate.toJSON() } }); };
  pc.ontrack = (e) => {
    const stream = e.streams[0] ?? new MediaStream([e.track]);
    audio.srcObject = stream;
    audio.play().catch(() => { /* 사용자 제스처 후 재시도 */ });
    const c = audioCtx();
    if (c) {
      try {
        const src = c.createMediaStreamSource(stream);
        const an = c.createAnalyser(); an.fftSize = 512;
        src.connect(an);
        peer.analyser = an;
      } catch { /* */ }
    }
  };
  pc.onconnectionstatechange = () => {
    updateStats();
    if (pc.connectionState === 'failed' && peer.initiator && wanted.has(id)) {
      // 연결 실패 시 새로 협상
      closePeer(id);
      setTimeout(() => { if (wanted.has(id) && !peers.has(id)) connectTo(id); }, 1500);
    }
  };

  if (initiator) {
    const tr = pc.addTransceiver('audio', { direction: 'sendrecv' });
    tr.sender.replaceTrack(localTrack());
    (async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('v:signal', { to: id, data: { description: pc.localDescription!.toJSON() } });
    })().catch((e) => console.warn('[voice] offer 실패', e));
  }
  updateStats();
  return peer;
}

function connectTo(id: string) {
  const myId = me.value?.userId;
  if (!myId || peers.has(id)) return;
  // 충돌(glare) 방지: ID 가 작은 쪽이 먼저 제안한다
  if (myId < id) createPeer(id, true);
}

function closePeer(id: string) {
  const p = peers.get(id);
  if (!p) return;
  p.pc.onconnectionstatechange = null;
  p.pc.close();
  p.audio.srcObject = null;
  peers.delete(id);
  const m = members.get(id);
  if (m) m.speaking = 0;
  updateStats();
}

bus.on('v:peers', ({ channel, peers: list }: { channel: string; peers: string[] }) => {
  voiceChannel.value = channel;
  voicePeers.value = list;
  wanted = new Set(list);
  for (const id of [...peers.keys()]) if (!wanted.has(id)) closePeer(id);
  for (const id of list) connectTo(id);
});

bus.on('v:signal', async ({ from, data }: { from: string; data: any }) => {
  try {
    let p = peers.get(from);
    if (data.description) {
      const desc = data.description as RTCSessionDescriptionInit;
      if (desc.type === 'offer') {
        if (p) closePeer(from);
        p = createPeer(from, false);
        await p.pc.setRemoteDescription(desc);
        const tr = p.pc.getTransceivers()[0];
        if (tr) { tr.direction = 'sendrecv'; await tr.sender.replaceTrack(localTrack()); }
        const answer = await p.pc.createAnswer();
        await p.pc.setLocalDescription(answer);
        socket.emit('v:signal', { to: from, data: { description: p.pc.localDescription!.toJSON() } });
      } else if (p) {
        await p.pc.setRemoteDescription(desc);
      }
      if (p) { for (const c of p.pendingCandidates) await p.pc.addIceCandidate(c).catch(() => {}); p.pendingCandidates = []; }
    } else if (data.candidate && p) {
      if (p.pc.remoteDescription) await p.pc.addIceCandidate(data.candidate).catch(() => {});
      else p.pendingCandidates.push(data.candidate);
    }
  } catch (e) { console.warn('[voice] signal 처리 실패', e); }
});

bus.on('room:left', () => { for (const id of [...peers.keys()]) closePeer(id); wanted.clear(); });

export async function setMic(on: boolean) {
  if (on) {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      micState.value = 'none';
      toast('이 주소에서는 브라우저가 마이크를 막습니다. https 주소(또는 localhost)로 접속해야 음성을 쓸 수 있어요. 텍스트 채팅은 그대로 가능합니다.', 'warn');
      socket.emit('mic', { state: 'none' });
      return;
    }
    try {
      if (!localStream) {
        localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
        const c = audioCtx();
        if (c) { const src = c.createMediaStreamSource(localStream); localAnalyser = c.createAnalyser(); localAnalyser.fftSize = 512; src.connect(localAnalyser); }
      }
      localStream.getAudioTracks().forEach((t) => (t.enabled = true));
      micState.value = 'on';
    } catch (e) {
      console.warn('[voice] 마이크 권한 실패', e);
      micState.value = 'none';
      toast('마이크를 사용할 수 없습니다. 브라우저의 마이크 권한을 확인해 주세요.', 'warn');
      socket.emit('mic', { state: 'none' });
      return;
    }
  } else {
    localStream?.getTracks().forEach((t) => t.stop());
    localStream = null; localAnalyser = null;
    micState.value = 'off';
  }
  for (const p of peers.values()) {
    const tr = p.pc.getTransceivers()[0];
    tr?.sender.replaceTrack(localTrack()).catch(() => {});
  }
  socket.emit('mic', { state: micState.value });
}

export function setVoiceVolume(v: number) { for (const p of peers.values()) p.audio.volume = v; }

const buf = new Uint8Array(256);
function level(an: AnalyserNode | null) {
  if (!an) return 0;
  an.getByteTimeDomainData(buf);
  let sum = 0;
  for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
  return Math.sqrt(sum / buf.length);
}

/** 매 프레임 호출: 말하는 사람 표시용 음량 */
export function updateSpeaking() {
  const myId = me.value?.userId;
  if (myId) { const m = members.get(myId); if (m) m.speaking = micState.value === 'on' ? Math.min(1, level(localAnalyser) * 8) : 0; }
  for (const p of peers.values()) { const m = members.get(p.id); if (m) m.speaking = m.mic === 'on' ? Math.min(1, level(p.analyser) * 8) : 0; }
}

/** 테스트/디버그용 */
(window as any).__voice = {
  peers: () => [...peers.values()].map((p) => ({ id: p.id, state: p.pc.connectionState })),
  stats: async () => {
    const out: Record<string, number> = {};
    for (const p of peers.values()) {
      const r = await p.pc.getStats();
      r.forEach((s: any) => { if (s.type === 'inbound-rtp' && s.kind === 'audio') out[p.id] = s.bytesReceived; });
    }
    return out;
  },
};
