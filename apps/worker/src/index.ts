import { createApp } from './app';
import { loadModFromAssets } from './modSource';
import { createD1Repo } from './repo/d1Repo';
import { verifyTurnstile } from './turnstile';

export default createApp({
  repo: (env) => createD1Repo(env.DB),
  verifyTurnstile: (secret, token, ip) => verifyTurnstile(secret, token, ip),
  loadMod: loadModFromAssets,
  now: () => new Date(),
});
