"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import StaffShell, { ErrorMessage, inputClass } from "./StaffShell";
import { api } from "@/lib/contracts";

export default function Login() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try { await api("login", { username: form.get("username"), password: form.get("password") }); router.replace("/staff"); }
    catch (error) { setError(error instanceof Error ? error.message : "Login belum berhasil."); }
    finally { setBusy(false); }
  }
  return <StaffShell title="Masuk untuk memeriksa batch">
    <form onSubmit={login} className="flex flex-col gap-5 p-4" aria-busy={busy}>
      <p className="text-sm text-ink2">Gunakan akun staf yang diberikan tim dapur.</p>
      <label className="flex flex-col gap-1.5 font-medium">Nama pengguna<input name="username" autoComplete="username" required maxLength={100} className={inputClass} /></label>
      <label className="flex flex-col gap-1.5 font-medium">Kata sandi<input name="password" type="password" autoComplete="current-password" required maxLength={200} className={inputClass} /></label>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <Button type="submit" variant="contained" size="large" disabled={busy}>{busy ? "Memeriksa akun..." : "Masuk"}</Button>
    </form>
  </StaffShell>;
}
