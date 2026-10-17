export interface SearchResult {
  readonly modId: string;
  readonly title: string;
  readonly url: string;
  readonly percent: number | null;
  /** 模組本身已內建完整繁中，不顯示進度 */
  readonly builtin: boolean;
}

export class SearchUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Search index unavailable', { cause });
    this.name = 'SearchUnavailableError';
  }
}

interface PagefindHit {
  data: () => Promise<{ url: string; meta: Record<string, string | undefined> }>;
}

export interface PagefindLike {
  search: (query: string) => Promise<{ results: PagefindHit[] } | null>;
}

export type PagefindLoader = () => Promise<PagefindLike>;

const PAGEFIND_URL = '/pagefind/pagefind.js';
export const MAX_RESULTS = 10;

const defaultLoader: PagefindLoader = () => import(/* @vite-ignore */ PAGEFIND_URL) as Promise<PagefindLike>;

export interface SearchClient {
  search: (query: string) => Promise<SearchResult[]>;
}

export function createSearchClient(load: PagefindLoader = defaultLoader): SearchClient {
  let instance: Promise<PagefindLike> | null = null;

  const getInstance = () => {
    instance ??= load().catch((err: unknown) => {
      instance = null;
      throw new SearchUnavailableError(err);
    });
    return instance;
  };

  return {
    search: async (query) => {
      const q = query.trim();
      if (q === '') return [];
      const pagefind = await getInstance();
      const response = await pagefind.search(q);
      const hits = await Promise.all((response?.results ?? []).slice(0, MAX_RESULTS).map((r) => r.data()));
      return hits.map((h) => {
        const percent = Number(h.meta.percent);
        return {
          modId: h.meta.modId ?? '',
          title: h.meta.title ?? h.url,
          url: h.url,
          percent: Number.isFinite(percent) ? percent : null,
          builtin: h.meta.builtin === 'true',
        };
      });
    },
  };
}
