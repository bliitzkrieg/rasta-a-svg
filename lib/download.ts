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
 * Creates a zip from the given entries and triggers a browser download.
 */
export async function downloadAsZip(
  entries: ZipFileEntry[],
  zipFileName = "download.zip",
): Promise<void> {
  const zip = new JSZip();
  for (const { path, content } of entries) {
    zip.file(path, content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipFileName;
  a.click();
  URL.revokeObjectURL(url);
}
