const PEM_PATTERN = /-----BEGIN (RSA )?PRIVATE KEY-----([\s\S]+?)-----END (?:RSA )?PRIVATE KEY-----/;

/** AlgorithmIdentifier { rsaEncryption, NULL } */
const RSA_ALGORITHM = [0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00];
const VERSION_ZERO = [0x02, 0x01, 0x00];

function derLength(n: number): number[] {
  if (n < 0x80) return [n];
  const bytes: number[] = [];
  for (let rest = n; rest > 0; rest = Math.floor(rest / 256)) bytes.unshift(rest % 256);
  return [0x80 | bytes.length, ...bytes];
}

function derNode(tag: number, content: readonly number[]): number[] {
  return [tag, ...derLength(content.length), ...content];
}

/** PKCS#1 RSAPrivateKey → PKCS#8 PrivateKeyInfo（GitHub 下載的私鑰是 PKCS#1） */
function wrapPkcs1(pkcs1: Uint8Array): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(derNode(0x30, [...VERSION_ZERO, ...RSA_ALGORITHM, ...derNode(0x04, [...pkcs1])]));
}

export function pemToPkcs8Der(pem: string): Uint8Array<ArrayBuffer> {
  const match = PEM_PATTERN.exec(pem.replace(/\\n/g, '\n'));
  const body = match?.[2]?.replace(/\s+/g, '');
  if (!match || !body) throw new Error('GITHUB_APP_PRIVATE_KEY is not a PEM private key');
  const der = Uint8Array.from(atob(body), (ch) => ch.charCodeAt(0));
  return match[1] ? wrapPkcs1(der) : der;
}
