import { z } from 'zod';
import { glossaryTermSchema, type GlossaryTerm, mergeGlossaries } from '@mlf/core/glossary';

export const GLOSSARY_URL = '/api/v1/glossary.json';

const payloadSchema = z.object({
  version: z.literal(1),
  global: z.array(glossaryTermSchema),
  mods: z.record(z.string(), z.array(glossaryTermSchema)),
});

/** 依 modId 取得合併後（模組覆蓋全域）的術語 */
export type GlossaryLookup = (modId: string) => readonly GlossaryTerm[];

export async function fetchGlossary(signal?: AbortSignal, fetchImpl: typeof fetch = fetch): Promise<GlossaryLookup> {
  const res = await fetchImpl(GLOSSARY_URL, { signal });
  if (!res.ok) throw new Error(`Glossary HTTP ${res.status}`);
  const data = payloadSchema.parse(await res.json());
  const cache = new Map<string, readonly GlossaryTerm[]>();
  return (modId) => {
    const cached = cache.get(modId);
    if (cached) return cached;
    const modTerms = Object.hasOwn(data.mods, modId) ? data.mods[modId]! : [];
    const terms = mergeGlossaries(data.global, modTerms);
    cache.set(modId, terms);
    return terms;
  };
}
