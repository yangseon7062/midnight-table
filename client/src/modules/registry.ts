import type { FunctionComponent } from 'preact';
import { MMGame } from './mm/MMGame';
import { CBGame } from './cb/CBGame';

/**
 * 클라이언트 게임 모듈 등록부.
 * 로비 레이어(RoomScreen)는 방 상태가 playing 일 때 gameModuleId 로 컴포넌트를 찾아 올려놓기만 한다.
 * 모듈 컴포넌트는 gameView(서버가 플레이어별로 걸러 보낸 상태)와 sendAction 만으로 동작한다.
 */
export interface GameModuleUI {
  id: string;
  Component: FunctionComponent<{ engine: { tableItems: number; inputBlocked: () => boolean } | null }>;
}

export const clientModules: Record<string, GameModuleUI> = {
  'murder-mystery': { id: 'murder-mystery', Component: MMGame },
  // 서버에만 등록하면 게임은 시작되는데 화면이 안 뜬다. 여기까지 넣어야 등록이 끝난다 (기준서 11-1).
  'card-battle': { id: 'card-battle', Component: CBGame },
};
