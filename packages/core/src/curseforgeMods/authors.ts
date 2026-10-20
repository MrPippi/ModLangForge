const tidy = (names: readonly string[]): string[] => [...new Set(names.map((n) => n.trim()).filter((n) => n !== ''))];

/** 草稿作者：有 Modrinth Owner／成員就用他們；組織擁有的專案查不到成員時，改用 CurseForge 上的全部作者；都沒有則為空 */
export function pickDraftAuthors(modrinthAuthors: readonly string[], curseforgeAuthors: readonly string[]): string[] {
  const modrinth = tidy(modrinthAuthors);
  return modrinth.length > 0 ? modrinth : tidy(curseforgeAuthors);
}
