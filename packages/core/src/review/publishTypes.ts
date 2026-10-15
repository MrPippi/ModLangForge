export const MOD_STATUS_TARGETS = ['partial', 'reviewed'] as const;
export type ModStatusTarget = (typeof MOD_STATUS_TARGETS)[number];

/** 已核准、待發佈的變更；creditName 只在作者已登入、公開且未停權時有值 */
export interface ApprovedChange {
  readonly id: number;
  readonly modId: string;
  readonly key: string;
  readonly baseTarget: string | null;
  readonly proposed: string;
  readonly reviewedAt: string;
  readonly creditName: string | null;
}

export interface StatusChange {
  readonly id: number;
  readonly modId: string;
  readonly status: ModStatusTarget;
  readonly createdAt: string;
}

/** repo 中 data/mods/<id>/ 三個檔案的原文 */
export interface ModFiles {
  readonly en: string;
  readonly zh: string;
  readonly meta: string;
}

export type ChangeOutcome = 'applied' | 'conflict' | 'superseded';

export interface ChangeResult {
  readonly id: number;
  readonly outcome: ChangeOutcome;
}

export interface PublishFile {
  readonly path: string;
  readonly content: string;
}

export interface PublishPlan {
  readonly files: readonly PublishFile[];
  readonly results: readonly ChangeResult[];
  readonly appliedStatusChangeIds: readonly number[];
  readonly message: string;
}

/** 套用後資料不合法；整批發佈必須中止 */
export class PublishValidationError extends Error {
  constructor(readonly modId: string, readonly issues: readonly string[]) {
    super(`publish validation failed for ${modId}`);
    this.name = 'PublishValidationError';
  }
}
