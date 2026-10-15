import type { ApprovedChange, ChangeResult, ModStatusTarget, StatusChange, SuggestionStatus } from '@mlf/core/review';

export interface AdminSuggestion {
  readonly id: number;
  readonly modId: string;
  readonly key: string;
  readonly baseTarget: string | null;
  readonly proposed: string;
  readonly note: string | null;
  readonly formatWarning: boolean;
  readonly status: SuggestionStatus;
  readonly authorUserId: number | null;
  readonly authorName: string | null;
  /** 封鎖用主體：user:<id> 或 ip:<hash> */
  readonly authorSubject: string;
  readonly reviewNote: string | null;
  readonly createdAt: string;
  readonly reviewedAt: string | null;
}

export interface SuggestionFilter {
  readonly status: SuggestionStatus;
  readonly modId: string | null;
  readonly limit: number;
}

export const PUBLISH_LOCK_TTL_MS = 10 * 60 * 1000;

export interface ReviewRepo {
  list(filter: SuggestionFilter): Promise<AdminSuggestion[]>;
  findById(id: number): Promise<AdminSuggestion | null>;
  /** 只對 pending 生效；同時把同 mod/key 的其他 pending 標為 superseded（單一交易） */
  approve(input: { id: number; reviewerId: number; proposed: string; formatWarning: boolean; now: string }): Promise<boolean>;
  /** pending、approved、conflict 可退回 */
  reject(input: { id: number; reviewerId: number; reason: string | null; now: string }): Promise<boolean>;
  createDirectEdit(input: { modId: string; key: string; baseTarget: string | null; proposed: string; formatWarning: boolean; reviewerId: number; authorHash: string; now: string }): Promise<number>;
  addStatusChange(input: { modId: string; status: ModStatusTarget; createdBy: number; now: string }): Promise<number>;
  listPendingStatusChanges(): Promise<StatusChange[]>;
  listApprovedForPublish(): Promise<ApprovedChange[]>;
  /** 沒有未過期的鎖時建立 commit_sha 為 NULL 的批次列並回傳 id，否則 null */
  acquirePublishLock(createdBy: number, now: Date): Promise<number | null>;
  releasePublishLock(batchId: number): Promise<void>;
  /** 每個 id 一條 UPDATE（D1 綁定參數上限 100），同一個 batch 內全有或全無 */
  completePublish(input: { batchId: number; commitSha: string | null; results: readonly ChangeResult[]; statusChangeIds: readonly number[] }): Promise<void>;
}
