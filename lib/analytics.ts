/**
 * Minimal GA4 event helper. Safe to call anywhere: it no-ops when the
 * gtag snippet has not loaded yet (or when analytics is blocked), and it
 * never throws, so tracking can never break the converter.
 */
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

type EventParams = Record<string, string | number | boolean>;

export function trackEvent(name: string, params: EventParams = {}): void {
  try {
    if (typeof window === "undefined") return;
    if (typeof window.gtag === "function") {
      window.gtag("event", name, params);
    }
  } catch {
    // Analytics must never break the app.
  }
}
