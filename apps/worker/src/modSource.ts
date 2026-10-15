import type { Env } from './env';

export interface ModStrings {
  readonly en: Readonly<Record<string, unknown>>;
  readonly zh: Readonly<Record<string, unknown>>;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 從靜態資產讀取 /api/v1/mods/<id>.json（單一真實來源：建置產物） */
export async function loadModFromAssets(env: Env, modId: string): Promise<ModStrings | null> {
  const res = await env.ASSETS.fetch(new Request(`https://assets.local/api/v1/mods/${encodeURIComponent(modId)}.json`));
  if (!res.ok) return null;
  const body: unknown = await res.json().catch(() => null);
  if (!isRecord(body) || !isRecord(body.en_us) || !isRecord(body.zh_tw)) return null;
  return { en: body.en_us, zh: body.zh_tw };
}
