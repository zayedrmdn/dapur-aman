import { Suspense } from "react";
import SupervisorApp from "../components/SupervisorApp";
export default function SupervisorPage() { return <Suspense fallback={<p className="p-4">Memuat aplikasi...</p>}><SupervisorApp /></Suspense>; }
