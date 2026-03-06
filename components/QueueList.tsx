"use client";

import type { ImageQueueItem } from "@/types/vector";

interface QueueListProps {
  items: ImageQueueItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}

function statusText(item: ImageQueueItem): string {
  if (item.status === "processing") {
    return `${item.progress}%`;
  }
  if (item.status === "error") {
    return "Failed";
  }
  if (item.status === "done") {
    return "Done";
  }
  if (item.status === "canceled") {
    return "Canceled";
  }
  return "Queued";
}

export function QueueList({
  items,
  selectedId,
  onSelect,
  onRetry,
  onRemove
}: QueueListProps) {
  return (
    <div className="panel queue">
      <h2>Queue</h2>
      {items.length === 0 ? <p className="muted">No files queued.</p> : null}
      <ul>
        {items.map((item) => (
          <li
            key={item.id}
            data-active={item.id === selectedId}
            onClick={() => onSelect(item.id)}
            className="queue-item"
          >
            <div>
              <strong>{item.fileName}</strong>
              <p className="muted">{Math.round(item.size / 1024)} KB</p>
            </div>
            <div className="queue-meta">
              <span>{statusText(item)}</span>
              {item.status === "error" ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRetry(item.id);
                  }}
                >
                  Retry
                </button>
              ) : null}
              <button
                type="button"
                className="danger"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(item.id);
                }}
              >
                Remove
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
