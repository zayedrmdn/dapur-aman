// The inspection a kitchen phone started but has not seen the result of.
// The id is stored on the device so a reload, a discarded tab or a switch to
// another Android app can find the saved batch again.

const STORAGE_KEY = "dapur.pending-inspection";
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;

/** Fired whenever the stored inspection changes, so every screen can redraw. */
export const PENDING_EVENT = "dapur:pending-inspection";

/** A run older than this is treated as expired rather than still working. */
export const PENDING_STALE_AFTER = 3 * 60_000;

/** A stored inspection older than this is ignored completely. */
export const PENDING_MAX_AGE = 24 * 60 * 60_000;

export type PendingInspection = { batchId: string; tableName: string; startedAt: number };

/** A batch id in the shape the backend and the BFF accept: batch_ plus ten hex characters. */
export function newBatchId(): string {
  const bytes = new Uint8Array(5);
  globalThis.crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
  return `batch_${suffix}`;
}

export function isBatchId(value: unknown): value is string {
  return typeof value === "string" && ID_PATTERN.test(value);
}

/** The stored inspection, or null when there is none, it is unreadable or it expired. */
export function readPendingInspection(): PendingInspection | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try { raw = window.localStorage.getItem(STORAGE_KEY); } catch { return null; }
  if (!raw) return null;
  let value: unknown;
  try { value = JSON.parse(raw); } catch { return null; }
  if (!value || typeof value !== "object") return null;
  const pending = value as Partial<PendingInspection>;
  if (!isBatchId(pending.batchId)) return null;
  const startedAt = typeof pending.startedAt === "number" ? pending.startedAt : 0;
  if (!startedAt || Date.now() - startedAt > PENDING_MAX_AGE) { clearPendingInspection(); return null; }
  return { batchId: pending.batchId, tableName: typeof pending.tableName === "string" ? pending.tableName : "", startedAt };
}

/** Store the inspection and tell the other screens about it. */
export function savePendingInspection(batchId: string, tableName: string): PendingInspection {
  const pending: PendingInspection = { batchId, tableName, startedAt: Date.now() };
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pending)); } catch { /* storage is blocked */ }
  notifyPendingChanged();
  return pending;
}

export function clearPendingInspection() {
  try { window.localStorage.removeItem(STORAGE_KEY); } catch { /* storage is blocked */ }
  notifyPendingChanged();
}

export function notifyPendingChanged() {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  window.dispatchEvent(new Event(PENDING_EVENT));
}

/** True when the stored inspection is old enough that it can no longer be running. */
export function isStale(pending: PendingInspection, now = Date.now()): boolean {
  return now - pending.startedAt > PENDING_STALE_AFTER;
}
