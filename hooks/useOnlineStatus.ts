"use client";

import { useEffect, useState } from "react";

/**
 * Returns whether the app is offline. Initializes to false so server and
 * first client render match (avoids hydration mismatch); updates after mount.
 */
export function useOnlineStatus(): boolean {
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const setOffline = () => setIsOffline(true);
    const setOnline = () => setIsOffline(false);
    window.addEventListener("offline", setOffline);
    window.addEventListener("online", setOnline);
    return () => {
      window.removeEventListener("offline", setOffline);
      window.removeEventListener("online", setOnline);
    };
  }, []);

  return isOffline;
}
