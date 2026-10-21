"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Button from "@mui/material/Button";
import { api, ApiError, type Batch, type Overview } from "@/lib/contracts";
import SupervisorShell from "./SupervisorShell";

export default function SupervisorApp({ review = false }: { review?: boolean }) {
    const router = useRouter();
    const [user, setUser] = useState<{ name: string; role: string } | null>(null);
    const [error, setError] = useState("");
    const [findCount, setFindCount] = useState(0)
    const [fixCount, setFixCount] = useState(0)
    const [dismissCount, setDismissCount] = useState(0)
    const [openCount, setOpenCount] = useState(0)
    async function logout() {
        try { await api("logout", {}); router.replace("/login"); }
        catch (error) { setError(error instanceof Error ? error.message : "Belum dapat keluar."); }
    }
    return <SupervisorShell 
        title={
            findCount + " safety findings today. " + fixCount + " fixed, " + dismissCount + " dismissed by staff," + openCount +" open now"}
        name={user?.name} 
        logout={user ? logout : undefined}
        >
        <div></div>
    </SupervisorShell>
}