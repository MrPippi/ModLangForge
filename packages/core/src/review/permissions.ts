/** 規格 §6 權限表 */
export const ROLES = ['admin', 'reviewer', 'contributor'] as const;
export type Role = (typeof ROLES)[number];

/** 可登入的來源；'minecraft' 保留給 3.1 */
export const LOGIN_PROVIDERS = ['github', 'discord'] as const;
export type LoginProvider = (typeof LOGIN_PROVIDERS)[number];

export type Action = 'suggest' | 'review' | 'publish' | 'manage';

const MATRIX: Readonly<Record<Action, readonly Role[]>> = {
  suggest: ['admin', 'reviewer', 'contributor'],
  review: ['admin', 'reviewer'],
  publish: ['admin'],
  manage: ['admin'],
};

/** 未登入（null）只能送出建議 */
export function can(role: Role | null, action: Action): boolean {
  if (role === null) return action === 'suggest';
  return MATRIX[action].includes(role);
}

const BOOTSTRAP_ENTRY = /^[a-z]+:.+$/;

/** ADMIN_BOOTSTRAP：逗號分隔的 provider:username，大小寫不敏感 */
export function parseAdminBootstrap(value: string | undefined): ReadonlySet<string> {
  const entries = (value ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => BOOTSTRAP_ENTRY.test(s));
  return new Set(entries);
}

export function isBootstrapAdmin(list: ReadonlySet<string>, provider: string, username: string | null): boolean {
  return username !== null && list.has(`${provider}:${username}`.toLowerCase());
}
