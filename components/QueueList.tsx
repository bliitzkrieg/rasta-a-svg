"use client";

import { useRef } from "react";
import { CheckCircle2, ImagePlus } from "lucide-react";
import type { ImageQueueItem } from "@/types/vector";
import { AppTooltip } from "./AppTooltip";

interface QueueListProps {
  items: ImageQueueItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onFiles: (files: FileList | File[]) => void;
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

function StatusBadge({ item }: { item: ImageQueueItem }) {
  if (item.status === "done") {
    return (
      <AppTooltip content="Done">
        <span className="queue-statusIcon" aria-label="Done">
          <CheckCircle2 size={16} strokeWidth={2.25} />
        </span>
      </AppTooltip>
    );
  }

  return <span>{statusText(item)}</span>;
}

export function QueueList({
  items,
  selectedId,
  onSelect,
  onRetry,
  onRemove,
  onFiles,
}: QueueListProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="panel queue">
      <div className="queue-header">
        <h2>Images</h2>
        <button
          type="button"
          className="queue-addButton"
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus size={16} strokeWidth={2.1} />
          Choose PNG files
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png"
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) {
              onFiles(event.target.files);
            }
          }}
        />
      </div>
      {items.length === 0 ? (
        <div className="queue-empty">
          <p>Drag PNG files anywhere on the page, or choose files to get started.</p>
          <span className="muted">Your uploaded images will appear here.</span>
        </div>
      ) : null}
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
              <StatusBadge item={item} />
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
