import { createApp } from './app';
import { loadModFromAssets } from './modSource';
import { createD1Repos } from './repo';
import { verifyTurnstile } from './turnstile';

export default createApp({
  repos: createD1Repos,
  verifyTurnstile: (secret, token, ip) => verifyTurnstile(secret, token, ip),
  loadMod: loadModFromAssets,
  now: () => new Date(),
  fetch: (input, init) => fetch(input, init),
});
