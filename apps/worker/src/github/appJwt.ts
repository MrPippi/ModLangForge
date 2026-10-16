import { toBase64Url } from '../auth/crypto';
import { pemToPkcs8Der } from './pem';

const encoder = new TextEncoder();
const CLOCK_SKEW_SEC = 60;
const LIFETIME_SEC = 540;

const encodeJson = (value: unknown): string => toBase64Url(encoder.encode(JSON.stringify(value)));

export function importPrivateKey(pem: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('pkcs8', pemToPkcs8Der(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

/** GitHub App JWT：iat 往前 60 秒容忍時鐘誤差，總效期 9 分鐘（上限 10 分鐘） */
export async function createAppJwt(appId: string, key: CryptoKey, now: Date): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000) - CLOCK_SKEW_SEC;
  const input = `${encodeJson({ alg: 'RS256', typ: 'JWT' })}.${encodeJson({ iat, exp: iat + LIFETIME_SEC, iss: appId })}`;
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, encoder.encode(input));
  return `${input}.${toBase64Url(new Uint8Array(signature))}`;
}
