import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clerkMocks = vi.hoisted(() => {
  const getUser = vi.fn();
  const updateUserMetadata = vi.fn();
  const clerkClient = vi.fn(async () => ({
    users: {
      getUser,
      updateUserMetadata,
    },
  }));

  return {
    getUser,
    updateUserMetadata,
    clerkClient,
  };
});

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: clerkMocks.clerkClient,
}));
vi.mock("server-only", () => ({}));

import {
  authorizeReservation,
  buildUtcDayKey,
  getQuotaSnapshot,
} from "@/lib/server/quota";

describe("quota service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-09T12:00:00.000Z"));
    clerkMocks.getUser.mockReset();
    clerkMocks.updateUserMetadata.mockReset();
    clerkMocks.clerkClient.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("builds UTC day keys from the current date", () => {
    expect(buildUtcDayKey(new Date("2026-03-09T23:59:59.000Z"))).toBe("2026-03-09");
  });

  it("resets stale metadata when the UTC day changes", async () => {
    clerkMocks.getUser.mockResolvedValue({
      privateMetadata: {
        rastaSvgQuota: {
          dayKeyUtc: "2026-03-08",
          used: 3,
          grants: ["r1", "r2", "r3"],
        },
      },
    });

    const snapshot = await getQuotaSnapshot("user_123", {
      isAuthenticated: true,
      isUnlimited: false,
    });

    expect(snapshot.usedToday).toBe(0);
    expect(snapshot.remainingToday).toBe(3);
    expect(clerkMocks.updateUserMetadata).toHaveBeenCalledWith(
      "user_123",
      expect.objectContaining({
        privateMetadata: expect.objectContaining({
          rastaSvgQuota: {
            dayKeyUtc: "2026-03-09",
            used: 0,
            grants: [],
          },
        }),
      }),
    );
  });

  it("treats repeated reservation IDs as idempotent", async () => {
    clerkMocks.getUser.mockResolvedValue({
      privateMetadata: {
        rastaSvgQuota: {
          dayKeyUtc: "2026-03-09",
          used: 1,
          grants: ["same-reservation"],
        },
      },
    });

    const result = await authorizeReservation(
      "user_123",
      "same-reservation",
      {
        isAuthenticated: true,
        isUnlimited: false,
      },
    );

    expect(result.granted).toBe(true);
    expect(result.quota.usedToday).toBe(1);
    expect(clerkMocks.updateUserMetadata).not.toHaveBeenCalled();
  });

  it("grants exactly three free generations per day", async () => {
    clerkMocks.getUser.mockResolvedValueOnce({
      privateMetadata: {
        rastaSvgQuota: {
          dayKeyUtc: "2026-03-09",
          used: 2,
          grants: ["r1", "r2"],
        },
      },
    });

    const granted = await authorizeReservation("user_123", "r3", {
      isAuthenticated: true,
      isUnlimited: false,
    });

    expect(granted.granted).toBe(true);
    expect(granted.quota.usedToday).toBe(3);
    expect(clerkMocks.updateUserMetadata).toHaveBeenCalledWith(
      "user_123",
      expect.objectContaining({
        privateMetadata: expect.objectContaining({
          rastaSvgQuota: {
            dayKeyUtc: "2026-03-09",
            used: 3,
            grants: ["r1", "r2", "r3"],
          },
        }),
      }),
    );

    clerkMocks.updateUserMetadata.mockReset();
    clerkMocks.getUser.mockResolvedValueOnce({
      privateMetadata: {
        rastaSvgQuota: {
          dayKeyUtc: "2026-03-09",
          used: 3,
          grants: ["r1", "r2", "r3"],
        },
      },
    });

    const denied = await authorizeReservation("user_123", "r4", {
      isAuthenticated: true,
      isUnlimited: false,
    });

    expect(denied.granted).toBe(false);
    expect(denied.reason).toBe("LIMIT_REACHED");
    expect(denied.quota.remainingToday).toBe(0);
    expect(clerkMocks.updateUserMetadata).not.toHaveBeenCalled();
  });

  it("keeps paid users unlimited", async () => {
    clerkMocks.getUser.mockResolvedValue({
      privateMetadata: {
        rastaSvgQuota: {
          dayKeyUtc: "2026-03-09",
          used: 3,
          grants: ["r1", "r2", "r3"],
        },
      },
    });

    const result = await authorizeReservation("user_123", "r4", {
      isAuthenticated: true,
      isUnlimited: true,
    });

    expect(result.granted).toBe(true);
    expect(result.quota.isUnlimited).toBe(true);
    expect(result.quota.usedToday).toBe(0);
    expect(clerkMocks.updateUserMetadata).not.toHaveBeenCalled();
  });
});
