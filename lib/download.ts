import JSZip from "jszip";

/**
 * Triggers a browser download of a string as a file.
 */
export function downloadString(
  content: string,
  fileName: string,
  type: string,
): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ZipFileEntry {
  path: string;
  content: string;
}

/**
 * Returns a path that does not collide with any path already used.
 * The first use keeps the path as-is; later duplicates get a numeric
 * suffix before the extension (logo.svg, logo-2.svg, logo-3.svg).
 * Without this, JSZip silently overwrites same-name entries, so a batch
 * with logo.png and logo.jpg would ship only the second image's files
 * while the UI still reports both images saved.
 */
export function uniqueZipPath(path: string, used: Set<string>): string {
  if (!used.has(path)) return path;
  const dot = path.lastIndexOf(".");
  const stem = dot > 0 ? path.slice(0, dot) : path;
  const ext = dot > 0 ? path.slice(dot) : "";
  let n = 2;
  let candidate = `${stem}-${n}${ext}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `${stem}-${n}${ext}`;
  }
  return candidate;
}

/**
 * Builds the ZIP blob for the given entries, de-duplicating colliding
 * paths so no file is silently lost.
 */
export async function buildZip(entries: ZipFileEntry[]): Promise<Blob> {
  const zip = new JSZip();
  const used = new Set<string>();
  for (const { path, content } of entries) {
    const unique = uniqueZipPath(path, used);
    used.add(unique);
    zip.file(unique, content);
  }
  return zip.generateAsync({ type: "blob" });
}

/**
 * Creates a zip from the given entries and triggers a browser download.
 */
export async function downloadAsZip(
  entries: ZipFileEntry[],
  zipFileName = "download.zip",
): Promise<void> {
  const blob = await buildZip(entries);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipFileName;
  a.click();
  URL.revokeObjectURL(url);
}
