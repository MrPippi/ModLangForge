import type { Context } from 'hono';
import type { Role } from '@mlf/core/review';
import type { Env } from './env';
import type { Repos } from './repo/types';

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export interface SessionUser {
  readonly id: number;
  readonly displayName: string;
  readonly role: Role;
}

export interface AppEnv {
  Bindings: Env;
  Variables: { repos: Repos; user: SessionUser | null };
}

export type Ctx = Context<AppEnv>;
