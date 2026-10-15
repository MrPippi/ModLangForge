import { createApp } from './app';
import { loadModFromAssets } from './modSource';
import { createD1Repos } from './repo';
import { verifyTurnstile } from './turnstile';

export default createApp({
  repos: createD1Repos,
  verifyTurnstile: (secret, token, ip, expectedHostname) => verifyTurnstile(secret, token, ip, fetch, expectedHostname),
  loadMod: loadModFromAssets,
  now: () => new Date(),
  fetch: (input, init) => fetch(input, init),
});
