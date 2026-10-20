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
  return file ? downloadModrinthFile(file.filename, file.url) : null;
}

/** 下載 Modrinth 檔案；不是 .jar 或超過大小上限時回傳 null */
export async function downloadModrinthFile(filename: string, url: string): Promise<Uint8Array | null> {
  if (!filename.endsWith('.jar')) return null;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
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

/** 與 getJson 相同，但 404（沒有這個專案）回傳 null */
export async function getJsonOrNull<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return (await res.json()) as T;
}
