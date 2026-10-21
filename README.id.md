# Dapur Aman by Nexara

[English](README.md)

Asisten keamanan pangan berbasis ponsel untuk dapur MBG (Makan Bergizi Gratis).

Dibuat oleh tim **Nexara Vision** untuk **Agentic AI Hackathon 2026**, bagian dari ITB Hackathon Series 2026 (21–23 Oktober 2026).

> Masih dalam pengerjaan. Kode ditulis selama 24 jam masa hacking (21–22 Oktober 2026).

Lihat [panduan pengembangan](DEVELOPMENT.md) untuk struktur proyek, tanggung jawab, dan kesepakatan kolaborasi.

## Menjalankan secara lokal

Butuh [Bun](https://bun.sh) 1.4 atau lebih baru, Node.js 24, dan [uv](https://docs.astral.sh/uv/) (uv memasang Python 3.13 sendiri). Bun memasang paket frontend dari `frontend/bun.lock`; jangan pakai npm atau pnpm. Next.js tetap berjalan di Node, jadi `node` harus ada di PATH. Di NixOS, jalankan perintah frontend di dalam `nix shell nixpkgs#nodejs_24`.

**Backend** (http://localhost:8000):

```
cd backend
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

Cek: http://localhost:8000/health mengembalikan `{"status":"ok"}`.

**Frontend** (http://localhost:3000):

```
cd frontend
bun install --frozen-lockfile
bun run dev
```

Sebelum push, jalankan `bun run lint` dan `bun run build`.

**Environment:** salin `backend/.env.example` ke `backend/.env` dan `frontend/.env.example` ke `frontend/.env.local`, lalu isi nilainya secara lokal. Jangan pernah meng-commit file tersebut.

**Model bersama:** `backend/agents/contract.py`; contoh statis ada di `backend/agents/examples/inspection_outcome.json`. Setelah backend punya skema API, buat tipe frontend saat backend berjalan: `bunx openapi-typescript http://localhost:8000/openapi.json -o lib/api-types.ts` (di dalam `frontend/`). Jangan pernah mengubah file hasil generate secara manual.

## Tim

| Nama   | Peran               | Cakupan peran                                          |
| ------ | ------------------- | ------------------------------------------------------ |
| Rabab  | Hustler (ketua tim) | Sisi bisnis: strategi produk, pitch, koordinasi tim    |
| Zayed  | Hacker              | Membangun produk: kode, AI, dan back end               |
| Finiko | Hipster             | Merancang pengalaman pengguna: antarmuka dan front end |
| Rohmat | Hacker              | Membangun produk: kode, AI, dan back end               |

## Penggunaan alat AI

Aturan acara mengizinkan AI coding assistant dan model generatif. Alat dan model yang kami pakai, beserta bagian yang dibantunya, dicantumkan di sini paling lambat saat pembekuan kode.

## Lisensi

[MIT](LICENSE)
