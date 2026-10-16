// apps/site/src/contributors/strings.ts
export const cs = {
  title: '貢獻者',
  description: '依已發佈譯文條數排列的社群貢獻者。',
  loading: '載入中…',
  loadFailed: '載入失敗，請稍後再試。',
  empty: '還沒有公開署名的已發佈貢獻。',
  emptyMod: '這個模組還沒有公開署名的社群貢獻。',
  forMod: (modId: string) => `模組 ${modId} 的貢獻者`,
  showAll: '查看全部貢獻者',
  modPage: '回到模組頁',
  published: (n: number) => `已發佈 ${n} 條`,
  modCount: (n: number) => `${n} 個模組`,
  notFound: '找不到這位貢獻者，對方可能未公開署名或尚無已發佈的貢獻。',
  back: '回到貢獻者列表',
  mods: '貢獻的模組',
  unverified: '未驗證',
  note: '只列出登入且公開署名的貢獻者；匿名送出的建議被採用時不署名。Minecraft 名稱為本人自填，未經驗證。',
} as const;
