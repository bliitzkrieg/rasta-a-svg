/** AdSense publisher ID (also in app/layout.tsx and public/ads.txt). */
export const ADSENSE_CLIENT = "ca-pub-1821039974714849";

/**
 * AdSense display ad unit IDs, one per placement.
 *
 * OWNER TODO: create these display ad units in the AdSense dashboard
 * (Ads > By ad unit > Display ads) and paste their numeric slot IDs here.
 * While a value is "TODO", AdSlot renders nothing, so no empty boxes or
 * layout shift reach production.
 */
export const AD_SLOTS = {
  /** Leaderboard between the converter and the first content section. */
  homeBelowTool: "TODO",
  /** 300x250 sticky unit under the Result panel (desktop, after a conversion). */
  sidebarResult: "TODO",
  /** Responsive in-article unit after the second section of a guide. */
  articleInline: "TODO",
  /** 300x600 sticky unit beside article text (desktop >= 1280px). */
  articleSidebar: "TODO",
} as const;

export type AdSlotName = keyof typeof AD_SLOTS;

export function isAdSlotConfigured(slot: string): boolean {
  return slot !== "TODO" && /^\d+$/.test(slot);
}
