"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useState } from "react";
import type { QuotaSnapshot } from "@/types/quota";

async function fetchQuota(): Promise<QuotaSnapshot> {
  const response = await fetch("/api/quota", {
    credentials: "same-origin",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Unable to load quota status.");
  }

  return (await response.json()) as QuotaSnapshot;
}

export function useQuotaStatus(initialQuota: QuotaSnapshot) {
  const { userId } = useAuth();
  const [quota, setQuota] = useState(initialQuota);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const refreshQuota = useCallback(async () => {
    setIsLoading(true);
    try {
      const nextQuota = await fetchQuota();
      setQuota(nextQuota);
      setError(undefined);
      return nextQuota;
    } catch (refreshError) {
      setError(
        refreshError instanceof Error
          ? refreshError.message
          : "Unable to refresh quota.",
      );
      return undefined;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshQuota();
  }, [refreshQuota, userId]);

  useEffect(() => {
    const onFocus = () => {
      void refreshQuota();
    };

    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refreshQuota]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const currentDayKey = new Date().toISOString().slice(0, 10);
      if (currentDayKey !== quota.dayKeyUtc) {
        void refreshQuota();
      }
    }, 60_000);

    return () => window.clearInterval(interval);
  }, [quota.dayKeyUtc, refreshQuota]);

  return {
    quota,
    setQuota,
    isLoading,
    error,
    refreshQuota,
  };
}
