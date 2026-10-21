import { Suspense } from "react";
import StaffApp from "../components/StaffApp";
export default function StaffPage() { return <Suspense fallback={<p className="p-4">Memuat aplikasi...</p>}><StaffApp /></Suspense>; }
