// 本機／CI 的 wrangler dev 需要一把 GitHub App 私鑰才能簽 JWT；假 GitHub 不驗簽，這裡產生一次性金鑰（PKCS#1，與 GitHub 下載格式相同）。
// 只補不覆蓋：.dev.vars 缺少的 .dev.vars.example 變數會被附加，使用者既有的值一律保留。不會印出私鑰。
import { generateKeyPairSync } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const FILE = '.dev.vars';
const EXAMPLE = '.dev.vars.example';
const KEY_NAME = 'GITHUB_APP_PRIVATE_KEY';

function keyOf(line: string): string | null {
  return /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line)?.[1] ?? null;
}

function missingExampleLines(current: string): string[] {
  const present = new Set(current.split(/\r?\n/).map(keyOf).filter((k): k is string => k !== null));
  return readFileSync(EXAMPLE, 'utf8')
    .split(/\r?\n/)
    .filter((line) => {
      const key = keyOf(line);
      return key !== null && !present.has(key);
    });
}

function generatedKeyLines(): string[] {
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs1', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });
  return ['# 本機假 GitHub 用的一次性金鑰（自動產生，非正式憑證）', `${KEY_NAME}="${privateKey.trim().replace(/\n/g, '\\n')}"`];
}

if (!existsSync(FILE)) copyFileSync(EXAMPLE, FILE);
const current = readFileSync(FILE, 'utf8');
const additions = [...missingExampleLines(current)];
if (!new RegExp(`^${KEY_NAME}=`, 'm').test(current)) additions.push(...generatedKeyLines());
if (additions.length > 0) {
  const prefix = current === '' || current.endsWith('\n') ? current : `${current}\n`;
  writeFileSync(FILE, `${prefix}${additions.join('\n')}\n`);
}
