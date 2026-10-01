/** Human-readable byte size: "820 KB", "1.2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** UTF-8 byte length of a string (SVG output is ASCII, but be exact). */
export function byteLength(text: string): number {
  return new Blob([text]).size;
}

/** Strip a supported image extension from a file name. */
export function baseName(fileName: string): string {
  return fileName.replace(/\.(png|jpe?g|webp)$/i, "");
}

/** Image MIME types the converter accepts. */
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Value for <input type="file" accept>. */
export const ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(",");
