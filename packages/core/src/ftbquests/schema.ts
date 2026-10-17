import { z } from 'zod';
import { isQuestKey } from './keys';

/** single：lang/<locale>.snbt；split：lang/<locale>/ 資料夾（FTB Quests 26.x） */
export const QUEST_LAYOUTS = ['single', 'split'] as const;
export const QUEST_STATUSES = ['supported', 'unsupported-version'] as const;

export type QuestLayout = (typeof QUEST_LAYOUTS)[number];
export type QuestStatus = (typeof QUEST_STATUSES)[number];

/** modpack.json 的 ftbquests；layout 只在 supported 時存在 */
export const ftbquestsMetaSchema = z.discriminatedUnion('status', [
  z.strictObject({ status: z.literal('supported'), layout: z.enum(QUEST_LAYOUTS) }),
  z.strictObject({ status: z.literal('unsupported-version') }),
]);

export type FtbquestsMeta = z.infer<typeof ftbquestsMetaSchema>;

/** FTB Quests 2100（MC 1.21）起任務文字才放在 lang 檔 */
export const MIN_QUEST_MC_VERSION = '1.21';

export function supportsQuestLang(mcVersion: string): boolean {
  const parts = mcVersion.split('.').map(Number);
  if (parts.some((n) => !Number.isInteger(n))) return false;
  const [major = 0, minor = 0] = parts;
  return major > 1 || (major === 1 && minor >= 21);
}

export const questKeySchema = z.string().refine(isQuestKey, { message: 'FTB 任務 key 格式不符' });
/** zod 的 record 會默默丟掉自有的 __proto__ key；API 端不該出現這種 key，直接視為無效 */
const noProtoKey = z.custom<unknown>((v) => typeof v !== 'object' || v === null || !Object.hasOwn(v, '__proto__'), { message: '不允許 __proto__ key' });
export const questRecordSchema = noProtoKey.pipe(z.record(questKeySchema, z.string()));

/** /api/v1/modpacks/<id>.json 的 ftbquests；網站產生、瀏覽器端讀取時驗證 */
export const questApiSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('supported'), layout: z.enum(QUEST_LAYOUTS), en_us: questRecordSchema, zh_tw: questRecordSchema }),
  z.object({ status: z.literal('unsupported-version') }),
]);

export type QuestApiBody = z.infer<typeof questApiSchema>;
