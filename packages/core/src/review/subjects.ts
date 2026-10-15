/** 頻率限制與封鎖的主體：ip:<64 位小寫 hex> 或 user:<正整數> */
const SUBJECT_PATTERN = /^(ip:[0-9a-f]{64}|user:[1-9]\d{0,15})$/;

export function ipSubject(hash: string): string {
  return `ip:${hash}`;
}

export function userSubject(id: number): string {
  return `user:${id}`;
}

export function isSubject(value: string): boolean {
  return SUBJECT_PATTERN.test(value);
}
