import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: '日期格式須為 YYYY-MM-DD' });

/** 網站功能更新（data/changelog/site.json，手寫） */
export const siteChangelogSchema = z.object({
  version: z.literal(1),
  entries: z.array(
    z.object({
      date: isoDate,
      title: z.string().trim().min(1),
      items: z.array(z.string().trim().min(1)).default([]),
    }),
  ),
});

export type SiteChangelog = z.infer<typeof siteChangelogSchema>;
export type SiteChangelogEntry = SiteChangelog['entries'][number];

/** 新支援的 Minecraft 版本 */
const newMcSchema = z.object({ modId: z.string().min(1), mcVersions: z.array(z.string().min(1)).min(1) });

/** 一天內的翻譯資料變動（data/changelog/translations.json，由 npm run changelog:build 從 git 紀錄產生） */
export const translationDaySchema = z.object({
  date: isoDate,
  /** 新收錄的模組（含內建繁中條目） */
  added: z.array(z.string().min(1)),
  /** 移除的模組 */
  removed: z.array(z.string().min(1)),
  /** 譯文有變動的模組 */
  translated: z.array(z.string().min(1)),
  /** 新增支援 Minecraft 版本的模組 */
  newMc: z.array(newMcSchema),
  /** 跟進模組新版本（沒有新增 Minecraft 版本） */
  updated: z.array(z.string().min(1)),
});

export const translationChangelogSchema = z.object({
  version: z.literal(1),
  days: z.array(translationDaySchema),
});

export type TranslationDay = z.infer<typeof translationDaySchema>;
export type TranslationChangelog = z.infer<typeof translationChangelogSchema>;
