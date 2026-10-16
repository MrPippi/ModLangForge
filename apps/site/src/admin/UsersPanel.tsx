import type { AdminApi } from './adminApi';
import { s } from './strings';

export default function UsersPanel(_props: { readonly api: AdminApi; readonly selfId: number }) {
  return <p className="text-muted">{s.tabs.users}</p>;
}
