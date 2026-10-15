import { useEffect, useRef } from 'react';
import { TURNSTILE_SITE_KEY } from '../lib/config';

declare global {
  interface Window {
    turnstile?: { render(el: HTMLElement, opts: { sitekey: string; callback(token: string): void; 'expired-callback'(): void; language: string }): string; remove(id: string): void };
  }
}

const SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT_URL}"]`);
  return new Promise((resolve, reject) => {
    const el = existing ?? Object.assign(document.createElement('script'), { src: SCRIPT_URL, async: true });
    el.addEventListener('load', () => resolve(), { once: true });
    el.addEventListener('error', () => reject(new Error('turnstile load failed')), { once: true });
    if (!existing) document.head.append(el);
  });
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
