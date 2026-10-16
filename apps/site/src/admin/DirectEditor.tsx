import type { FetchLike } from '../islands/api';
import type { AdminApi } from './adminApi';
import { s } from './strings';

export default function DirectEditor(_props: { readonly api: AdminApi; readonly fetchImpl: FetchLike }) {
  return <p className="text-muted">{s.tabs.edit}</p>;
}
