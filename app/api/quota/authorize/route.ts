import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { authorizeReservation, buildQuotaAuthContext } from "@/lib/server/quota";
import type { QuotaAuthorizeRequest } from "@/types/quota";

function isAuthorizeRequest(value: unknown): value is QuotaAuthorizeRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    "reservationId" in value &&
    typeof value.reservationId === "string" &&
    value.reservationId.length > 0
  );
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as unknown;
  if (!isAuthorizeRequest(body)) {
    return NextResponse.json(
      { error: "Invalid quota authorization payload." },
      { status: 400 },
    );
  }

  const authState = await auth();
  const authContext = buildQuotaAuthContext(authState);
  const result = await authorizeReservation(
    authState.userId,
    body.reservationId,
    authContext,
  );

  const status =
    result.reason === "AUTH_REQUIRED"
      ? 401
      : result.reason === "LIMIT_REACHED"
        ? 429
        : 200;

  return NextResponse.json(result, { status });
}
