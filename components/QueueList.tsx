"use client";

import { useRef } from "react";
import { CheckCircle2, ImagePlus } from "lucide-react";
import type { ImageQueueItem } from "@/types/vector";
import { AppTooltip } from "./AppTooltip";
import styles from "./QueueList.module.css";

interface QueueListProps {
  items: ImageQueueItem[];
  selectedId?: string;
  onSelect: (id: string) => void;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
  onFiles: (files: FileList | File[]) => void;
}

function statusText(item: ImageQueueItem): string {
  if (item.status === "processing") return `${item.progress}%`;
  if (item.status === "error") return "Failed";
  if (item.status === "done") return "Done";
  if (item.status === "canceled") return "Canceled";
  return "Queued";
}

function StatusBadge({ item }: { item: ImageQueueItem }) {
  if (item.status === "done") {
    return (
      <AppTooltip content="Done">
        <span className={styles.statusIcon} aria-label="Done">
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

  const handleRowKeyDown = (event: React.KeyboardEvent, id: string) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
    }
  };

  return (
    <div className={`panel ${styles.queueList}`}>
      <div className={styles.header}>
        <h2>Images</h2>
        <button
          type="button"
          className={styles.addButton}
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
            if (event.target.files) onFiles(event.target.files);
          }}
        />
      </div>
      {items.length === 0 ? (
        <div className={styles.empty}>
          <p>Drag PNG files anywhere on the page, or choose files to get started.</p>
          <span className="muted">Your uploaded images will appear here.</span>
        </div>
      ) : null}
      <ul className={styles.list} role="listbox" aria-label="Image queue">
        {items.map((item) => (
          <li
            key={item.id}
            role="option"
            aria-selected={item.id === selectedId}
            tabIndex={0}
            data-active={item.id === selectedId}
            className={styles.item}
            onClick={() => onSelect(item.id)}
            onKeyDown={(e) => handleRowKeyDown(e, item.id)}
          >
            <div>
              <strong>{item.fileName}</strong>
              <p className="muted">{Math.round(item.size / 1024)} KB</p>
            </div>
            <div className={styles.meta}>
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
