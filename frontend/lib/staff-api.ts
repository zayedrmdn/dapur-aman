import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { SESSION_SECONDS, signSession, verifySession, type User } from "./session";

const MAX_PHOTO = 4 * 1024 * 1024;
const attempts = new Map<string, { count: number; until: number }>();
const activeInspections = new Set<string>();
const ID = /^[a-zA-Z0-9_-]{1,64}$/;

class RequestError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function rateLimit(key: string, maximum: number) {
  const now = Date.now();
  for (const [entry, value] of attempts) if (value.until <= now) attempts.delete(entry);
  const prior = attempts.get(key);
  if ((!prior && attempts.size >= 1000) || (prior && prior.count >= maximum)) {
    throw new RequestError(429, "Terlalu banyak permintaan. Coba lagi dalam beberapa menit.");
  }
  attempts.set(key, { count: (prior?.count ?? 0) + 1, until: prior?.until ?? now + 10 * 60_000 });
}

async function body(request: Request, limit: number): Promise<ArrayBuffer> {
  if (Number(request.headers.get("content-length")) > limit) throw new RequestError(413, "Ukuran permintaan terlalu besar.");
  const reader = request.body?.getReader();
  const chunks: ArrayBuffer[] = [];
  let size = 0;
  if (reader) {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) { await reader.cancel(); throw new RequestError(413, "Ukuran permintaan terlalu besar."); }
      chunks.push(new Uint8Array(value).buffer);
    }
  }
  return new Blob(chunks).arrayBuffer();
}

async function jsonBody(request: Request) {
  try {
    const data = JSON.parse(new TextDecoder().decode(await body(request, 8192)));
    if (!data || Array.isArray(data) || typeof data !== "object") throw new Error();
    return data;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(400, "Data permintaan tidak valid.");
  }
}

async function unauthorized(response: Response) {
  const payload = await response.json().catch(() => null);
  const unknownActor = typeof payload?.detail === "string" && /actor/i.test(payload.detail);
  if (unknownActor) return new RequestError(401, "Akun sesi ini tidak dikenali. Silakan masuk kembali.");
  return new RequestError(503, "Backend menolak kunci server. Periksa BACKEND_SHARED_SECRET.");
}

function actionError(input: Record<string, unknown>) {
  const findingActions = ["fixed", "dismissed"];
  const batchActions = ["on_hold", "lift_hold", "close"];
  if (!ID.test(String(input.batch_id ?? ""))) return "Batch tidak valid.";
  const action = String(input.action);
  if (![...findingActions, ...batchActions].includes(action)) return "Tindakan tidak dikenal.";
  const hasFinding = input.finding_id != null;
  if (findingActions.includes(action) && !hasFinding) return "Pilih temuan yang valid.";
  if (hasFinding && !ID.test(String(input.finding_id))) return "Pilih temuan yang valid.";
  if (typeof input.reason !== "string" || input.reason.trim().length < 3 || input.reason.length > 2000) return "Tulis alasan (minimal 3 karakter).";
  return null;
}

async function upstream(path: string, actorId?: string, data?: FormData | object) {
  const base = process.env.BACKEND_URL;
  const secret = process.env.BACKEND_SHARED_SECRET;
  if (!base || !secret) throw new RequestError(503, "Koneksi backend belum dikonfigurasi.");
  const url = new URL(base);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname))) {
    throw new RequestError(503, "Backend memerlukan koneksi HTTPS.");
  }
  const headers = new Headers({ "X-Shared-Secret": secret });
  if (actorId) headers.set("X-Actor-Id", actorId);
  const multipart = data instanceof FormData;
  if (data && !multipart) headers.set("Content-Type", "application/json");
  try {
    const response = await fetch(new URL(path, url), {
      method: data ? "POST" : "GET", headers,
      body: data ? (multipart ? data : JSON.stringify(data)) : undefined,
      cache: "no-store", redirect: "error", signal: AbortSignal.timeout(150_000),
    });
    if (response.status === 401) throw await unauthorized(response);
    if (response.status === 403) throw new RequestError(403, "Akun Anda tidak berwenang untuk tindakan ini. Hanya supervisor yang dapat melakukannya.");
    const payload = await response.json();
    if (response.status >= 500 && !(response.status === 502 && payload?.detail?.run_id)) {
      throw new RequestError(502, "Backend belum dapat menyelesaikan permintaan. Muat ulang data tersimpan sebelum mencoba lagi.");
    }
    return { status: response.status, payload };
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(502, "Koneksi backend terputus atau melewati batas waktu. Muat ulang batch untuk memeriksa hasil tersimpan.");
  }
}

function isSameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") return false;
  try {
    return new URL(origin).host === request.headers.get("host");
  } catch {
    return false;
  }
}

function cookie(response: NextResponse, value: string, maxAge: number) {
  response.cookies.set("dapur_session", value, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge });
}

export async function staffApi(request: NextRequest, path: string) {
  let inspecting: string | undefined;
  try {
    if (request.method === "POST" && !isSameOrigin(request)) {
      throw new RequestError(403, "Permintaan harus berasal dari aplikasi ini.");
    }
    const key = process.env.SESSION_SECRET ?? "";
    if (key.length < 32) throw new RequestError(503, "Sesi belum dikonfigurasi. Isi SESSION_SECRET di server (minimal 32 karakter).");
    if (path === "login" && request.method === "POST") {
      const input = await jsonBody(request);
      if (typeof input.username !== "string" || !input.username.trim() || input.username.length > 100 || typeof input.password !== "string" || !input.password || input.password.length > 200) {
        throw new RequestError(400, "Isi nama pengguna dan kata sandi.");
      }
      rateLimit(`login:${input.username.trim().toLowerCase()}`, 10);
      // Login has a distinct 401 response; do not turn invalid passwords into server errors.
      const base = process.env.BACKEND_URL;
      const secret = process.env.BACKEND_SHARED_SECRET;
      if (!base || !secret) throw new RequestError(503, "Koneksi backend belum dikonfigurasi.");
      const loginUrl = new URL(base);
      if (loginUrl.protocol !== "https:" && !(loginUrl.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(loginUrl.hostname))) throw new RequestError(503, "Backend memerlukan HTTPS.");
      const reply = await fetch(new URL("/api/auth/login", loginUrl), {
        method: "POST", headers: { "Content-Type": "application/json", "X-Shared-Secret": secret },
        body: JSON.stringify({ username: input.username.trim(), password: input.password }), cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15_000),
      });
      if (reply.status === 401) throw new RequestError(401, "Nama pengguna atau kata sandi salah.");
      if (!reply.ok) throw new RequestError(502, "Login backend belum tersedia.");
      const user: User = await reply.json();
      const signed = signSession(user, key);
      if (!verifySession(signed, key)) throw new RequestError(502, "Profil login tidak valid.");
      const response = NextResponse.json({ user: { name: user.name, role: user.role } });
      cookie(response, signed, SESSION_SECONDS);
      return response;
    }
    const session = verifySession(request.cookies.get("dapur_session")?.value, key);
    if (!session) throw new RequestError(401, "Sesi berakhir. Silakan masuk kembali.");
    if (path === "logout" && request.method === "POST") {
      const response = NextResponse.json({ success: true }); cookie(response, "", 0); return response;
    }
    if (path === "session" && request.method === "GET") return NextResponse.json({ user: { name: session.name, role: session.role } });
    let result;
    if (request.method === "GET") {
      if (path === "overview") result = await upstream("/api/overview", session.actor_id);
      else if (path === "supervisor/feed") result = await upstream("/api/supervisor/feed", session.actor_id);
      else if (/^batches\/[a-zA-Z0-9_-]{1,64}$/.test(path)) result = await upstream(`/api/${path}`, session.actor_id);
      else if (/^runs\/[a-zA-Z0-9_-]{1,64}\/events$/.test(path)) result = await upstream(`/api/${path}`, session.actor_id);
      else throw new RequestError(404, "Halaman data tidak ditemukan.");
    } else if (path === "actions" && request.method === "POST") {
      const input = await jsonBody(request);
      const invalid = actionError(input);
      if (invalid) throw new RequestError(400, invalid);
      result = await upstream("/api/actions", session.actor_id, { batch_id: input.batch_id, finding_id: input.finding_id ?? null, action: input.action, reason: input.reason.trim() });
    } else if (path === "inspect" && request.method === "POST") {
      if (activeInspections.has(session.actor_id)) throw new RequestError(429, "Inspeksi Anda masih berjalan. Tunggu hasilnya.");
      const bytes = await body(request, MAX_PHOTO + 65_536);
      let form: FormData;
      try { form = await new Response(bytes, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData(); }
      catch { throw new RequestError(400, "Foto tidak dapat dibaca. Pilih foto kembali."); }
      const photo = form.get("photo");
      const table = String(form.get("table_name") ?? "").trim();
      const menu = String(form.get("menu_items") ?? "").trim();
      const batch = String(form.get("batch_id") ?? "");
      if (!(photo instanceof File) || photo.size === 0 || photo.size > MAX_PHOTO || !["image/jpeg", "image/png", "image/webp"].includes(photo.type)) throw new RequestError(400, "Pilih foto JPEG, PNG, atau WebP hingga 4 MB.");
      if (!table || table.length > 100 || !menu || menu.length > 2000 || (batch && !ID.test(batch))) throw new RequestError(400, "Isi nama meja dan komponen menu yang diperiksa.");
      const upload = new FormData();
      upload.set("photo", photo); upload.set("table_name", table); upload.set("menu_items", menu);
      if (batch) upload.set("batch_id", batch);
      upload.set("is_retake", form.get("is_retake") === "true" ? "true" : "false");
      rateLimit(`inspect:${session.actor_id}`, 10);
      inspecting = session.actor_id; activeInspections.add(inspecting);
      result = await upstream("/api/inspections/upload-and-run", session.actor_id, upload);
    } else throw new RequestError(404, "Operasi tidak tersedia.");
    return NextResponse.json(result.payload, { status: result.status });
  } catch (error) {
    const known = error instanceof RequestError;
    return NextResponse.json({ detail: known ? error.message : "Permintaan gagal. Coba lagi atau periksa koneksi server." }, { status: known ? error.status : 502 });
  } finally { if (inspecting) activeInspections.delete(inspecting); }
}
