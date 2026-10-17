import { z } from 'zod';
import { isValidModpackId } from '@mlf/core/modpack';
import { MODPACK_INDEX_API } from '../../lib/config';

export interface ModpackOption {
  readonly id: string;
  readonly name: string;
  readonly nameZh: string | null;
}

const questSummarySchema = z.union([
  z.object({ status: z.literal('supported'), total: z.number().int().nonnegative() }),
  z.object({ status: z.literal('unsupported-version') }),
]);

const indexSchema = z.object({
  version: z.literal(1),
  modpacks: z.array(z.object({
    id: z.string().refine(isValidModpackId, { message: '整合包 id 不合法' }),
    name: z.string().min(1),
    nameZh: z.string().nullable(),
    kubejs: z.object({ total: z.number().int().nonnegative() }).nullable(),
    ftbquests: questSummarySchema.nullish(),
  })),
});

type FetchImpl = (url: string) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

/** 網站上有 KubeJS 文字或 FTB 任務文字可翻的整合包 */
export async function fetchModpackIndex(fetchImpl: FetchImpl = fetch): Promise<ModpackOption[]> {
  const res = await fetchImpl(MODPACK_INDEX_API);
  if (!res.ok) throw new Error(`Modpack index HTTP ${res.status}`);
  const body = indexSchema.parse(await res.json());
  return body.modpacks
    .filter((p) => (p.kubejs?.total ?? 0) > 0 || (p.ftbquests?.status === 'supported' && p.ftbquests.total > 0))
    .map(({ id, name, nameZh }) => ({ id, name, nameZh }));
}
