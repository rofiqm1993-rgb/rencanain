import { publicConfig } from "@/lib/server-runtime";
export const dynamic = "force-dynamic";
export async function GET() { return Response.json(publicConfig(), { headers: { "Cache-Control": "no-store" } }); }
