export type Finding = {
  id: string; title: string; level: "safety" | "quality"; detail: string;
  state: "open" | "fixed" | "dismissed";
  box: { x_min: number; y_min: number; x_max: number; y_max: number } | null;
  run_id: string | null; photo_id: string | null; photo_url: string | null;
  rule_reference: string | null; evidence_gap: string | null; suggested_action: string | null;
  resolution_text: string | null;
};
export type Run = {
  id: string; state: string; outcome: string; headline: string; provider: string; model: string;
  created_at: string; photo_id: string | null; photo_url: string | null; uncertainty: string[];
  error: { code?: string; message?: string; retryable?: boolean } | null;
};
export type Batch = {
  batch_id: string; table_name: string; status: string; photo_url: string | null;
  runs: Run[]; findings: Finding[];
  actions: { id: string; action: string; reason: string; actor_name: string; created_at: string }[];
};
export type Overview = { packing_photos: { batch_id: string; table_name: string; summary_label: string; status: string }[] };
export type Event = { sequence: number; timestamp: string; agent: string; step: string; kind: string; status: string; summary: string; error: string | null; uncertainty: string | null; references: string[] };

export class ApiError extends Error {
  constructor(message: string, public detail?: { batch_id?: string; run_id?: string }, public status?: number) { super(message); }
}
export async function api<T>(path: string, data?: object | FormData): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/staff/${path}`, {
      method: data ? "POST" : "GET", cache: "no-store",
      headers: data && !(data instanceof FormData) ? { "Content-Type": "application/json" } : undefined,
      body: data ? (data instanceof FormData ? data : JSON.stringify(data)) : undefined,
    });
  } catch { throw new ApiError("Koneksi terputus. Muat ulang batch sebelum mengulang inspeksi."); }
  const result = await response.json();
  if (!response.ok) {
    const detail = result.detail;
    throw new ApiError(typeof detail === "string" ? detail : detail?.message ?? "Permintaan belum berhasil. Muat ulang data lalu coba lagi.", typeof detail === "object" ? detail : undefined, response.status);
  }
  return result;
}
export function time(value: string) {
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`;
  return new Date(normalized).toLocaleString("id-ID", { dateStyle: "short", timeStyle: "short" });
}
