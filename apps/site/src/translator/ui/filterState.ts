import type { SearchScope, StatusFilter } from './filterEntries';

export interface FilterState {
  readonly query: string;
  readonly status: StatusFilter;
  readonly scope: SearchScope;
  readonly showReference: boolean;
}

export const initialFilter: FilterState = { query: '', status: 'all', scope: 'current', showReference: false };
