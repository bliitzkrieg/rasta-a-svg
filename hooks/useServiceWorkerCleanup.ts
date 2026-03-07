"use client";

import { useEffect } from "react";

/**
 * Unregisters any existing service workers so the app does not rely on SW caching.
 */
export function useServiceWorkerCleanup(): void {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      });
    }
  }, []);
}
