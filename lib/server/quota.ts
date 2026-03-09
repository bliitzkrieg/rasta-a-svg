import "server-only";

import { clerkClient } from "@clerk/nextjs/server";
import type { QuotaAuthorizeResponse, QuotaSnapshot, StoredQuotaMetadata } from "@/types/quota";
import {
  FREE_DAILY_LIMIT,
  QUOTA_FEATURE_SLUG,
  QUOTA_METADATA_KEY,
} from "@/types/quota";

export interface QuotaAuthContext {
  isAuthenticated: boolean;
  isUnlimited: boolean;
}

type MaybeStoredQuota = Partial<StoredQuotaMetadata> | null | undefined;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function buildUtcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function buildResetAtUtc(dayKeyUtc: string): string {
  return `${dayKeyUtc}T24:00:00.000Z`.replace("T24", "T00");
}

function buildNextResetAtUtc(date: Date): string {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1),
  ).toISOString();
}

function clampUsed(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : 0;
}

function normalizeGrants(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.filter((entry): entry is string => typeof entry === "string")),
  );
}

function normalizeStoredQuota(
  input: MaybeStoredQuota,
  dayKeyUtc: string,
): { state: StoredQuotaMetadata; changed: boolean } {
  if (!input || input.dayKeyUtc !== dayKeyUtc) {
    return {
      state: {
        dayKeyUtc,
        used: 0,
        grants: [],
      },
      changed: true,
    };
  }

  const used = clampUsed(input.used);
  const grants = normalizeGrants(input.grants);
  const changed = used !== input.used || grants.length !== input.grants?.length;

  return {
    state: {
      dayKeyUtc,
      used,
      grants,
    },
    changed,
  };
}

function toSnapshot(
  authContext: QuotaAuthContext,
  quotaState: StoredQuotaMetadata,
): QuotaSnapshot {
  const remainingToday = authContext.isUnlimited
    ? 0
    : Math.max(0, FREE_DAILY_LIMIT - quotaState.used);

  return {
    isAuthenticated: authContext.isAuthenticated,
    isUnlimited: authContext.isUnlimited,
    dailyLimit: FREE_DAILY_LIMIT,
    usedToday: authContext.isUnlimited ? 0 : quotaState.used,
    remainingToday,
    resetAtUtc: buildNextResetAtUtc(new Date(`${quotaState.dayKeyUtc}T00:00:00.000Z`)),
    dayKeyUtc: quotaState.dayKeyUtc,
  };
}

async function getUserQuotaState(userId: string): Promise<{
  state: StoredQuotaMetadata;
  privateMetadata: Record<string, unknown>;
  changed: boolean;
}> {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const privateMetadata = isRecord(user.privateMetadata)
    ? { ...user.privateMetadata }
    : {};
  const dayKeyUtc = buildUtcDayKey(new Date());
  const storedQuota = isRecord(privateMetadata[QUOTA_METADATA_KEY])
    ? (privateMetadata[QUOTA_METADATA_KEY] as MaybeStoredQuota)
    : undefined;
  const { state, changed } = normalizeStoredQuota(storedQuota, dayKeyUtc);

  return {
    state,
    privateMetadata,
    changed,
  };
}

async function persistQuotaState(
  userId: string,
  privateMetadata: Record<string, unknown>,
  state: StoredQuotaMetadata,
): Promise<void> {
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    privateMetadata: {
      ...privateMetadata,
      [QUOTA_METADATA_KEY]: state,
    },
  });
}

function signedOutSnapshot(): QuotaSnapshot {
  const now = new Date();
  const dayKeyUtc = buildUtcDayKey(now);

  return {
    isAuthenticated: false,
    isUnlimited: false,
    dailyLimit: FREE_DAILY_LIMIT,
    usedToday: 0,
    remainingToday: FREE_DAILY_LIMIT,
    resetAtUtc: buildNextResetAtUtc(now),
    dayKeyUtc,
  };
}

export function buildQuotaAuthContext(authState: {
  isAuthenticated: boolean;
  has?: unknown;
}): QuotaAuthContext {
  const hasAuthorization =
    typeof authState.has === "function"
      ? (authState.has as (params: {
          feature?: `user:${string}` | `org:${string}`;
          plan?: `user:${string}` | `org:${string}`;
        }) => boolean)
      : undefined;

  return {
    isAuthenticated: authState.isAuthenticated,
    isUnlimited:
      authState.isAuthenticated &&
      Boolean(hasAuthorization?.({ feature: QUOTA_FEATURE_SLUG })),
  };
}

export async function getQuotaSnapshot(
  userId: string | null | undefined,
  authContext: QuotaAuthContext,
): Promise<QuotaSnapshot> {
  if (!authContext.isAuthenticated || !userId) {
    return signedOutSnapshot();
  }

  const { state, privateMetadata, changed } = await getUserQuotaState(userId);
  if (changed) {
    await persistQuotaState(userId, privateMetadata, state);
  }

  return toSnapshot(authContext, state);
}

export async function authorizeReservation(
  userId: string | null | undefined,
  reservationId: string,
  authContext: QuotaAuthContext,
): Promise<QuotaAuthorizeResponse> {
  if (!authContext.isAuthenticated || !userId) {
    return {
      granted: false,
      reason: "AUTH_REQUIRED",
      quota: signedOutSnapshot(),
    };
  }

  const { state, privateMetadata, changed } = await getUserQuotaState(userId);
  if (changed) {
    await persistQuotaState(userId, privateMetadata, state);
  }

  if (authContext.isUnlimited) {
    return {
      granted: true,
      quota: toSnapshot(authContext, state),
    };
  }

  if (state.grants.includes(reservationId)) {
    return {
      granted: true,
      quota: toSnapshot(authContext, state),
    };
  }

  if (state.used >= FREE_DAILY_LIMIT) {
    return {
      granted: false,
      reason: "LIMIT_REACHED",
      quota: toSnapshot(authContext, state),
    };
  }

  const nextState: StoredQuotaMetadata = {
    dayKeyUtc: state.dayKeyUtc,
    used: state.used + 1,
    grants: [...state.grants, reservationId],
  };

  await persistQuotaState(userId, privateMetadata, nextState);

  return {
    granted: true,
    quota: toSnapshot(authContext, nextState),
  };
}
