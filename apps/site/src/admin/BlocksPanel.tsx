import type { AdminApi } from './adminApi';
import { s } from './strings';

export default function BlocksPanel(_props: { readonly api: AdminApi }) {
  return <p className="text-muted">{s.tabs.blocks}</p>;
}
