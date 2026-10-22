"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import StaffShell, { ErrorMessage, inputClass } from "./StaffShell";
import { api } from "@/lib/contracts";
import { EyeIcon, EyeOffIcon } from "./icons";

export default function Login() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const { user } = await api<{ user: { role: string } }>("login", { username: form.get("username"), password: form.get("password") });
      router.replace(user.role === "supervisor" ? "/dashboard" : "/staff");
    }
    catch (error) { setError(error instanceof Error ? error.message : "Login belum berhasil."); }
    finally { setBusy(false); }
  }
  return <StaffShell title="Masuk untuk memeriksa batch">
    <form onSubmit={login} className="flex flex-col gap-5 p-4" aria-busy={busy}>
      <p className="text-sm text-ink2">Gunakan akun staf atau supervisor yang diberikan tim dapur.</p>
      <label className="flex flex-col gap-1.5 font-medium">Nama pengguna<input name="username" autoComplete="username" required maxLength={100} className={inputClass} /></label>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="font-medium">Kata sandi</label>
        <div className="relative">
          <input id="password" name="password" type={showPassword ? "text" : "password"} autoComplete="current-password" required maxLength={200} className={`${inputClass} pr-12`} />
          <button type="button" onClick={() => setShowPassword(shown => !shown)} aria-label="Tampilkan kata sandi" aria-pressed={showPassword} aria-controls="password" className="absolute inset-y-0 right-0 grid w-12 place-items-center rounded-r-xl text-ink2 hover:text-brand">
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </div>
      {error && <ErrorMessage>{error}</ErrorMessage>}
      <Button type="submit" variant="contained" size="large" disabled={busy}>{busy ? "Memeriksa akun..." : "Masuk"}</Button>
    </form>
  </StaffShell>;
}
