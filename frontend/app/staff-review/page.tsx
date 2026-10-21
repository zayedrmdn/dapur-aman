import { Suspense } from "react";
import StaffApp from "../components/StaffApp";
export default function ReviewPage() { return <Suspense fallback={<p className="p-4">Memuat hasil...</p>}><StaffApp review /></Suspense>; }
