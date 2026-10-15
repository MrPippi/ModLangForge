import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};

/** 伺服器與 hydration 首次渲染回傳 false，之後為 true；用來只在 JS 執行後顯示互動元件，且不造成 hydration 不一致 */
export function useHydrated(): boolean {
  return useSyncExternalStore(subscribe, () => true, () => false);
}
