import { useEffect, useRef } from 'react';
import { TURNSTILE_SITE_KEY } from '../lib/config';

declare global {
  interface Window {
    turnstile?: { render(el: HTMLElement, opts: { sitekey: string; callback(token: string): void; 'expired-callback'(): void; language: string }): string; remove(id: string): void };
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

let scriptPromise: Promise<void> | null = null;

/** 全頁只注入一次 script；所有 widget 共用同一個 Promise，失敗時清除以便下次重新注入 */
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const el = Object.assign(document.createElement('script'), { src: SCRIPT_URL, async: true });
    el.addEventListener('load', () => resolve(), { once: true });
    el.addEventListener('error', () => {
      scriptPromise = null;
      el.remove();
      reject(new Error('turnstile load failed'));
    }, { once: true });
    document.head.append(el);
  });
  return scriptPromise;
}

export default function TurnstileWidget({ onToken }: { readonly onToken: (token: string) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let id: string | undefined;
    let cancelled = false;
    loadScript().then(() => {
      if (cancelled || !box.current || !window.turnstile) return;
      id = window.turnstile.render(box.current, { sitekey: TURNSTILE_SITE_KEY, callback: onToken, 'expired-callback': () => onToken(''), language: 'zh-tw' });
    }, () => onToken(''));
    return () => {
      cancelled = true;
      if (id && window.turnstile) window.turnstile.remove(id);
    };
  }, [onToken]);
  return <div ref={box} />;
}
