import { DISPLAY_NAME_MAX } from '@mlf/core/review';
import { t } from '../i18n/zh-TW';

export const m = {
  title: '個人資料',
  description: '設定顯示名稱、Minecraft 名稱與是否公開署名，並查看你送出的建議。',
  loading: '載入中…',
  loadFailed: '載入失敗，請稍後再試。',
  needLogin: '登入後可以設定顯示名稱與署名方式，請從右上角登入。',
  profileTitle: '顯示名稱與署名',
  displayName: '顯示名稱',
  displayNameHint: `最多 ${DISPLAY_NAME_MAX} 個字。已發佈的署名不會隨改名更新，之後的貢獻會使用新名稱。`,
  displayNameTooLong: `顯示名稱最多 ${DISPLAY_NAME_MAX} 個字。`,
  isPublic: '公開署名（列在貢獻者頁與模組署名）',
  isPublicHint: '關閉後立即從貢獻者頁移除，之後發佈的譯文也不會署名；已寫入模組資料的署名不會移除。',
  save: '儲存',
  saving: '儲存中…',
  saved: '已儲存。',
  mcTitle: 'Minecraft 帳號',
  mcName: '玩家名稱',
  mcHint: '自行填寫。會向 Mojang 確認名稱存在並顯示頭像；目前無法證明帳號屬於你，因此會標示「未驗證」。',
  mcSave: '確認並儲存',
  checking: '確認中…',
  mcClear: '移除',
  mcCleared: '已移除 Minecraft 名稱。',
  unverified: '未驗證',
  mySuggestions: t.account.mySuggestions,
  anonymousNote: t.account.anonymousNote,
} as const;
