import { createHash } from "node:crypto";

// Durable idempotency for operations with side effects at the provider.
// A key is claimed before the work starts and completed with its result, so:
//   * a retry after success returns the stored result without redoing work,
//   * a concurrent duplicate is refused while the first is in progress,
//   * reusing a key for a different request is refused,
//   * a failed attempt can be retried with the same key.

export type IdempotencyStatus = "in_progress" | "completed" | "failed";

export interface IdempotencyRecord {
  status: IdempotencyStatus;
  requestHash: string;
  response: unknown;
}

export interface IdempotencyStore {
  /** Insert an in_progress record, or return the existing record for this key. */
  claim(key: string, operation: string, requestHash: string): Promise<"claimed" | IdempotencyRecord>;
  /** Re-claim a key whose previous attempt failed. Returns false if someone else got it first. */
  reclaim(key: string, requestHash: string): Promise<boolean>;
  complete(key: string, response: unknown): Promise<void>;
  fail(key: string, response: unknown): Promise<void>;
}

export class IdempotencyConflictError extends Error {
  constructor(readonly reason: "in_progress" | "different_request") {
    super(reason === "in_progress" ? "This request is already being processed" : "Idempotency key reused for a different request");
    this.name = "IdempotencyConflictError";
  }
}

export function hashRequest(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function runIdempotent<T>(
  store: IdempotencyStore,
  input: { key: string; operation: string; request: unknown },
  work: () => Promise<T>,
): Promise<{ result: T; replayed: boolean }> {
  const requestHash = hashRequest(input.request);
  const claimed = await store.claim(input.key, input.operation, requestHash);
  if (claimed !== "claimed") {
    if (claimed.requestHash !== requestHash) throw new IdempotencyConflictError("different_request");
    if (claimed.status === "completed") return { result: claimed.response as T, replayed: true };
    if (claimed.status === "in_progress") throw new IdempotencyConflictError("in_progress");
    if (!(await store.reclaim(input.key, requestHash))) throw new IdempotencyConflictError("in_progress");
  }
  try {
    const result = await work();
    await store.complete(input.key, result);
    return { result, replayed: false };
  } catch (error) {
    await store.fail(input.key, { error: error instanceof Error ? error.name : "Error" });
    throw error;
  }
}
