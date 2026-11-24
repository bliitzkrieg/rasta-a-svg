/**
 * True when following this link would leave the converter page, discarding
 * in-memory conversions. The queue and results are never persisted, so
 * navigating away (or closing the tab) loses converted images, and coming
 * back opens an empty converter.
 */
export function isLeavingLink(href: string | null, currentPath: string): boolean {
  if (!href) return false;
  if (href.startsWith("#")) return false;
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return false;
  let url: URL;
  try {
    url = new URL(href, "https://png2svg.io");
  } catch {
    return false;
  }
  if (url.origin !== "https://png2svg.io") return true;
  const targetPath = url.pathname.replace(/\/$/, "") || "/";
  const here = currentPath.replace(/\/$/, "") || "/";
  return targetPath !== here;
}
