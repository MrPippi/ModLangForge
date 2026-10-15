export interface CommitSummary {
  readonly perMod: readonly { readonly modId: string; readonly count: number }[];
  readonly statuses: readonly { readonly modId: string; readonly status: string }[];
  readonly contributors: readonly string[];
}

export function buildCommitMessage(s: CommitSummary): string {
  const total = s.perMod.reduce((n, m) => n + m.count, 0);
  const title = total > 0
    ? `chore(data): publish ${total} reviewed translation${total === 1 ? '' : 's'}`
    : 'chore(data): update translation status';
  const lines = [
    ...(s.perMod.length > 0 ? [`Mods: ${s.perMod.map((m) => `${m.modId} (${m.count})`).join(', ')}`] : []),
    ...(s.statuses.length > 0 ? [`Status: ${s.statuses.map((m) => `${m.modId} -> ${m.status}`).join(', ')}`] : []),
    ...(s.contributors.length > 0 ? [`Contributors: ${s.contributors.join(', ')}`] : []),
  ];
  return [title, '', ...lines, '', 'Published from the ModLangForge review queue.'].join('\n');
}
