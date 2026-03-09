export const FREE_DAILY_LIMIT = 3;
export const QUOTA_FEATURE_SLUG = "user:unlimited_generations";
export const QUOTA_BLOCKED_REASON = "daily_limit";
export const QUOTA_METADATA_KEY = "rastaSvgQuota";

export type QuotaBlockedReason = typeof QUOTA_BLOCKED_REASON;

export interface QuotaSnapshot {
  isAuthenticated: boolean;
  isUnlimited: boolean;
  dailyLimit: number;
  usedToday: number;
  remainingToday: number;
  resetAtUtc: string;
  dayKeyUtc: string;
}

export interface QuotaAuthorizeRequest {
  reservationId: string;
}

export interface QuotaAuthorizeResponse {
  granted: boolean;
  reason?: "AUTH_REQUIRED" | "LIMIT_REACHED";
  quota: QuotaSnapshot;
}

export interface StoredQuotaMetadata {
  dayKeyUtc: string;
  used: number;
  grants: string[];
}
