import { type NextRequest } from "next/server";
import { staffApi } from "@/lib/staff-api";

export const maxDuration = 150;

async function handle(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const response = await staffApi(request, path.join("/"));
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Vary", "Cookie");
  return response;
}

export { handle as GET, handle as POST };
