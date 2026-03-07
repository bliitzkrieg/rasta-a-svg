import type { ImageQueueItem } from "@/types/vector";

export function makeQueueItem(file: File): ImageQueueItem {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    fileName: file.name,
    mimeType: file.type,
    size: file.size,
    status: "queued",
    progress: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function withUpdated(
  items: ImageQueueItem[],
  id: string,
  updater: (item: ImageQueueItem) => ImageQueueItem,
): ImageQueueItem[] {
  return items.map((item) => (item.id === id ? updater(item) : item));
}
