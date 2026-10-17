import { resolve } from 'node:path';
import { MAX_JAR_BYTES } from '@mlf/core/jar';
import { type ModrinthVersion, primaryFile } from '@mlf/core/pipeline';
import type { DetectedMod } from '@mlf/core';
import { USER_AGENT } from '@mlf/core/modpackImport';

export const API = 'https://api.modrinth.com/v2';
export { USER_AGENT };
export const DATA_DIR = resolve(import.meta.dirname, '..', '..', 'data');
export const MODS_DIR = resolve(DATA_DIR, 'mods');

export async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}

export async function downloadJar(v: ModrinthVersion): Promise<Uint8Array | null> {
  const file = primaryFile(v);
  if (!file || !file.filename.endsWith('.jar')) return null;
  const res = await fetch(file.url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${file.url}`);
  const size = Number(res.headers.get('content-length') ?? 0);
  if (size > MAX_JAR_BYTES) return null;
  return new Uint8Array(await res.arrayBuffer());
}

export function largestNamespace(mods: readonly DetectedMod[]): DetectedMod | undefined {
  return [...mods].filter((m) => m.format === 'json').sort((a, b) => b.order.length - a.order.length)[0];
}

export function toJson(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}
