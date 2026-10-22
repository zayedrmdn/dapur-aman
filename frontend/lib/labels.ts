// Bahasa labels for values the backend emits in English or snake_case.
// Unknown values fall back to a humanised form, never raw snake_case.

export function humanise(value: string | null | undefined): string {
  if (!value) return "";
  const text = value.replace(/_/g, " ").replace(/\s+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1).toLowerCase() : "";
}

const CONCERN_LABELS: Record<string, string> = {
  foreign_object: "Benda asing",
  packaging_fragment: "Serpihan kemasan",
  physical_hazard: "Bahaya fisik",
  hair: "Rambut",
  insect: "Serangga",
  pest: "Hama",
  larva: "Larva",
  worm: "Cacing",
  caterpillar: "Ulat",
  mould: "Jamur",
  mold: "Jamur",
  spoilage: "Tanda basi",
  discoloration: "Perubahan warna",
  undercooked: "Kurang matang",
  raw_appearance: "Tampak mentah",
  missing_component: "Komponen menu kurang",
  menu_component_missing: "Komponen menu kurang",
  different_component: "Komponen menu berbeda",
  empty_compartment: "Sekat baki kosong",
  menu_mismatch: "Menu tidak sesuai",
  portion_shortage: "Porsi kurang",
  insufficient_portion: "Porsi kurang",
  visual_portion_shortage: "Porsi tampak kurang",
  irregular_presentation: "Penyajian tidak rapi",
  messy_presentation: "Penyajian berantakan",
  presentation_issue: "Masalah penyajian",
  dirty_tray: "Baki kotor",
};

/** Finding title or concern_type ("foreign_object", "Foreign object") to a Bahasa title. */
export function concernLabel(value: string | null | undefined): string {
  if (!value) return "";
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return CONCERN_LABELS[key] ?? humanise(value);
}

const PHRASES: Record<string, string> = {
  // Overview summary_label bases and inspection ui_texts
  "no visible concerns; human review still required": "Tidak ada masalah terlihat; tetap perlu pemeriksaan manusia",
  "findings or uncertainty need human review": "Ada temuan atau ketidakpastian; perlu ditinjau manusia",
  "inspection incomplete or photo needs retake": "Inspeksi belum lengkap atau foto perlu diulang",
  "uncertainty needs review": "Ketidakpastian perlu ditinjau",
  "no spots": "Tidak ada temuan",
  "retake needed": "Perlu foto ulang",
  "needs review": "Perlu ditinjau",
  "visible check needs human review": "Pemeriksaan visual perlu ditinjau manusia",
  "photo needs a retake": "Foto perlu diulang",
  "inspection incomplete; retry or retake": "Inspeksi belum lengkap; coba lagi atau foto ulang",
  "uncertainty or open findings need human review": "Ketidakpastian atau temuan terbuka perlu ditinjau manusia",
  "human review required": "Perlu pemeriksaan manusia",
  // Supervisor badge_label
  closed: "Ditutup",
  "on hold": "Ditahan",
  "finding open": "Temuan terbuka",
  packing: "Packing",
  "inspection incomplete": "Inspeksi belum lengkap",
  // Statuses
  open: "Terbuka",
  fixed: "Diperbaiki",
  dismissed: "Diabaikan",
  in_review: "Dalam peninjauan",
  on_hold: "Ditahan",
  lift_hold: "Penahanan dicabut",
  close: "Batch ditutup",
  finding_open: "Temuan terbuka",
  clean: "Tidak ada masalah terlihat",
  review_required: "Perlu ditinjau",
  retake_required: "Perlu foto ulang",
  "resolution time unavailable": "Waktu penyelesaian tidak tersedia",
};

function spots(count: string, level: string): string {
  return `${count} temuan ${level === "safety" ? "keamanan" : "kualitas"}`;
}

/** One backend label/status string to Bahasa. Handles the known dynamic patterns. */
export function backendLabel(value: string | null | undefined): string {
  if (!value) return "";
  const text = value.trim();
  const lower = text.toLowerCase();
  if (PHRASES[lower]) return PHRASES[lower];
  let m = /^open, (\d+) min$/i.exec(text);
  if (m) return `Terbuka, ${m[1]} mnt`;
  m = /^(fixed|dismissed) in (\d+) min$/i.exec(text);
  if (m) return `${m[1].toLowerCase() === "fixed" ? "Diperbaiki" : "Diabaikan"} dalam ${m[2]} mnt`;
  m = /^(\d+) (safety|quality) spots?$/i.exec(text);
  if (m) return spots(m[1], m[2].toLowerCase());
  m = /^(\d+) (safety|quality) spots? to fix before packing on$/i.exec(text);
  if (m) return `${spots(m[1], m[2].toLowerCase())} perlu diperbaiki sebelum lanjut packing`;
  if (lower === "needs review before packing on") return "Perlu ditinjau sebelum lanjut packing";
  // Overview summary: "<base>; 1 fixed, 2 dismissed"
  const semi = text.indexOf("; ");
  if (semi > 0 && /^\s*\d+ (fixed|dismissed)/i.test(text.slice(semi + 2))) {
    const actions = text.slice(semi + 2).replace(/(\d+) fixed/gi, "$1 diperbaiki").replace(/(\d+) dismissed/gi, "$1 diabaikan");
    return `${backendLabel(text.slice(0, semi))}; ${actions}`;
  }
  // Already Bahasa or free text: keep it; only humanise bare snake_case tokens.
  return /^[a-z0-9]+(_[a-z0-9]+)+$/.test(text) ? humanise(text) : text;
}

/** Readable batch name from its meja and school; production meja names already include the school. */
export function batchHeading(table: string | null | undefined, school: string | null | undefined): string {
  const place = table?.trim() ?? "";
  if (!school || place.includes(school)) return place || "Batch tanpa nama meja";
  return place ? `${school} • ${place}` : school;
}

/** The one user-facing date and time format: "22 Okt, 10.49 WIB". */
export function formatWib(date: Date): string {
  return `${date.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} WIB`;
}

/** "<batch> - found 22 Oct 00:28 UTC" to "Ditemukan 22 Okt, 07.28 WIB"; the batch id stays out of the text. */
export function findingSubtitle(value: string | null | undefined): string {
  if (!value) return "";
  const m = /^(.*) - found (\d{1,2}) ([A-Za-z]{3}) (\d{2}):(\d{2}) UTC$/.exec(value.trim());
  if (!m) return value;
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const month = months.indexOf(m[3].toLowerCase());
  if (month < 0) return value;
  const year = new Date().getUTCFullYear();
  return `Ditemukan ${formatWib(new Date(Date.UTC(year, month, Number(m[2]), Number(m[4]), Number(m[5]))))}`;
}

const AGENT_LABELS: Record<string, string> = {
  orchestrator: "Orkestrator",
  vision: "Vision",
  compliance: "Kepatuhan",
  workflow: "Alur kerja",
  fixture: "Simulasi",
};

/** Agent/actor ids ("orchestrator", "orchestrator_model") to readable labels. */
export function agentLabel(value: string | null | undefined): string {
  if (!value) return "";
  const key = value.trim().toLowerCase();
  if (AGENT_LABELS[key]) return AGENT_LABELS[key];
  const m = /^([a-z]+)_(model|reply_check)$/.exec(key);
  if (m && AGENT_LABELS[m[1]]) return `${AGENT_LABELS[m[1]]} (${m[2] === "model" ? "panggilan model" : "cek format balasan"})`;
  return humanise(value);
}

const EVENT_STATUS: Record<string, string> = {
  started: "Dimulai",
  completed: "Selesai",
  failed: "Gagal",
  retrying: "Diulang",
};

export function eventStatusLabel(value: string | null | undefined): string {
  if (!value) return "";
  return EVENT_STATUS[value.toLowerCase()] ?? humanise(value);
}

const RUN_ERROR: Record<string, string> = {
  input: "Foto atau data masukan tidak dapat diproses.",
  provider: "Layanan model AI sedang bermasalah.",
  rule: "Aturan pemeriksaan tidak dapat diterapkan.",
  validation: "Jawaban model tidak sesuai format yang diharapkan.",
  timeout: "Inspeksi melewati batas waktu.",
  storage: "Hasil belum dapat disimpan.",
};

/** Bahasa message for a failed run; the technical detail stays separate. */
export function runErrorLabel(error: { code?: string; stage?: string } | null | undefined): string {
  const stage = error?.stage?.toLowerCase() ?? "";
  const base = RUN_ERROR[stage] ?? "Inspeksi tidak selesai.";
  return `${base} Coba lagi atau ambil foto ulang.`;
}
