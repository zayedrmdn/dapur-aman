import { formatWib } from "./labels";

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
  error: { code?: string; stage?: string; message?: string; retryable?: boolean } | null;
};
export type Batch = {
  batch_id: string; table_name: string; menu_name?: string | null; school_name?: string | null; status: string; photo_url: string | null; created_at: string;
  runs: Run[]; findings: Finding[];
  hold_reason?: string | null;
  actions: { id: string; action: string; reason: string; actor_name: string; created_at: string }[];
};
export type Overview = { packing_photos: { batch_id: string; table_name: string; summary_label: string; status: string; batch_status?: string; hold_reason?: string | null; school_name?: string | null; created_at?: string | null }[] };
export type Event = { sequence: number; timestamp: string; agent: string; step: string; kind: string; status: string; summary: string; error: string | null; uncertainty: string | null; references: string[] };

export class ApiError extends Error {
  constructor(message: string, public detail?: { batch_id?: string; run_id?: string; code?: string; stage?: string }, public status?: number) { super(message); }
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
export function parseUtc(value: string) {
  return new Date(/(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : `${value}Z`);
}
export function time(value: string) {
  return formatWib(parseUtc(value));
}

export type SafetyFeedItem = {
  finding_id: string;
  batch_id: string;
  run_id?: string | null;
  photo_id?: string | null;
  thumbnail_url?: string | null;
  title: string;
  subtitle: string;
  status: "open" | "fixed" | "dismissed";
  icon_type: string;
  duration_min: number;
  duration_label: string;
  resolution_note?: string | null;
};

export type ActiveConcern = {
  finding_id: string;
  batch_id: string;
  run_id?: string | null;
  photo_id?: string | null;
  photo_url?: string | null;
  title: string;
  detail: string;
  level: string;
  subtitle: string;
  assigned_staff: string;
  box: { x_min: number; y_min: number; x_max: number; y_max: number } | null;
  hold_action_label: string;
  helper_text?: string;
};

export type BatchListItem = {
  batch_id: string;
  menu_name: string;
  photos_count: number;
  subtitle: string;
  status: "closed" | "packing" | "finding_open" | "on_hold";
  badge_label: string;
  badge_color: string;
  hold_reason?: string | null;
  table_name?: string | null;
  school_name?: string | null;
  created_at?: string | null;
};

export type SchoolSummary = {
  id: string;
  name: string;
  principal_name: string;
  phone_number: string;
  address: string;
  target_portions: number;
  cleared_batches: number;
  in_progress_batches: number;
  status: "ready" | "in_progress" | "standby";
};

export type SupervisorDashboardData = {
  supervisor_name: string;
  kitchen_name: string;
  date_str: string;
  headline: string;
  is_supervisor: boolean;
  stats: {
    total_safety: number;
    fixed: number;
    dismissed: number;
    open: number;
  };
  total_portions_cleared: number;
  clean_pass_rate: number;
  active_concern: ActiveConcern | null;
  safety_feed: SafetyFeedItem[];
  batches: BatchListItem[];
  schools: SchoolSummary[];
};

