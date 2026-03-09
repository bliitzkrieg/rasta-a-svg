import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { buildQuotaAuthContext, getQuotaSnapshot } from "@/lib/server/quota";

export async function GET() {
  const authState = await auth();
  const authContext = buildQuotaAuthContext(authState);
  const quota = await getQuotaSnapshot(authState.userId, authContext);

  return NextResponse.json(quota);
}
