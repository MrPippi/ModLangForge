import { buildProject } from '../merge/buildProject';
import { mergeProject } from '../merge/mergeMod';
import { projectStats, type ProjectStats } from '../merge/stats';
import type { DetectedMod, ModProject } from '../types';
import { type CatalogModpack, isValidModpackId, isValidNamespace } from './schema';
import type { KubejsData, KubejsTexts } from './types';

/** 建立 KubeJS 專案所需的整合包資訊 */
export interface ModpackRef {
  readonly id: string;
  readonly name: string;
  readonly version: string;
}

export function modpackRef(meta: Pick<CatalogModpack, 'id' | 'name' | 'source'>): ModpackRef {
  return { id: meta.id, name: meta.name, version: meta.source.version };
}

const PREFIX = 'modpack';

/** 翻譯工具的專案 ID；與模組專案（id = modId）不會撞名 */
export function modpackProjectId(modpackId: string, ns: string): string {
  return `${PREFIX}:${modpackId}:${ns}`;
}

export function parseModpackProjectId(id: string): { readonly modpackId: string; readonly ns: string } | null {
  const parts = id.split(':');
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  const [, modpackId = '', ns = ''] = parts;
  return isValidModpackId(modpackId) && isValidNamespace(ns) ? { modpackId, ns } : null;
}

export function kubejsProjectName(name: string, ns: string): string {
  return `${name}（KubeJS：${ns}）`;
}

/** 站上 KubeJS 文字視為一個「jar 偵測結果」，以便沿用 buildProject／mergeProject 的規則 */
function toDetected(pack: ModpackRef, ns: string, texts: KubejsTexts): DetectedMod {
  return {
    modId: ns,
    name: kubejsProjectName(pack.name, ns),
    version: pack.version,
    jarName: '',
    format: 'json',
    source: texts.en,
    order: Object.keys(texts.en),
    zhTw: texts.zh,
  };
}

export function kubejsProject(pack: ModpackRef, ns: string, texts: KubejsTexts, now: number): ModProject {
  return { ...buildProject(toDetected(pack, ns, texts), now), id: modpackProjectId(pack.id, ns) };
}

/** 重新載入同一整合包：原文相同保留譯文、原文變更標 new、移除的 key 標 obsolete */
export function mergeKubejsProject(existing: ModProject, pack: ModpackRef, ns: string, texts: KubejsTexts, now: number): ModProject {
  return mergeProject(existing, toDetected(pack, ns, texts), now);
}

export function kubejsProjects(pack: ModpackRef, kubejs: KubejsData, now: number): ModProject[] {
  return Object.keys(kubejs).sort().flatMap((ns) => {
    const texts = kubejs[ns];
    return texts ? [kubejsProject(pack, ns, texts, now)] : [];
  });
}

/** 各命名空間合計的完成度；沒有命名空間時為 null */
export function kubejsStats(projects: readonly ModProject[]): ProjectStats | null {
  const [first] = projects;
  return first ? projectStats({ ...first, entries: projects.flatMap((p) => p.entries) }) : null;
}
