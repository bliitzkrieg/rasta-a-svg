"use client";

import { useEffect, useRef, useState } from "react";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { CheckCircle2, Plus, Trash2 } from "lucide-react";
import { getFileBlob } from "@/lib/storage/indexedDb";
import { ACCEPT_ATTRIBUTE, formatBytes } from "@/lib/format";
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
  onDeleteAll: () => void;
}

function statusText(item: ImageQueueItem): string {
  if (item.status === "processing") return `${item.progress}%`;
  if (item.status === "error") return "Failed";
  if (item.status === "done") return "Done";
  if (item.status === "canceled") return "Canceled";
  return "Queued";
}

/** Object URLs for each queued file's thumbnail, revoked when items leave. */
function useThumbnails(items: ImageQueueItem[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const urlsRef = useRef<Record<string, string>>({});

  const idsKey = items.map((item) => item.id).join("|");
  useEffect(() => {
    const ids = new Set(idsKey ? idsKey.split("|") : []);
    let cancelled = false;
    // Revoke thumbnails of removed items.
    for (const [id, url] of Object.entries(urlsRef.current)) {
      if (!ids.has(id)) {
        URL.revokeObjectURL(url);
        delete urlsRef.current[id];
      }
    }
    const missing = [...ids].filter((id) => !urlsRef.current[id]);
    void Promise.all(
      missing.map(async (id) => {
        const blob = await getFileBlob(id);
        if (cancelled || !blob) return;
        urlsRef.current[id] = URL.createObjectURL(blob);
      }),
    ).then(() => {
      if (!cancelled) setUrls({ ...urlsRef.current });
    });
    setUrls({ ...urlsRef.current });
    return () => {
      cancelled = true;
    };
  }, [idsKey]);

  useEffect(
    () => () => {
      for (const url of Object.values(urlsRef.current)) URL.revokeObjectURL(url);
      urlsRef.current = {};
    },
    [],
  );

  return urls;
}

export function QueueList({
  items,
  selectedId,
  onSelect,
  onRetry,
  onRemove,
  onFiles,
  onDeleteAll,
}: QueueListProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const thumbnails = useThumbnails(items);

  const handleRowKeyDown = (event: React.KeyboardEvent, id: string) => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(id);
    }
  };

  return (
    <div className={`panel ${styles.queueList}`}>
      <div className={styles.header}>
        <h2>Images ({items.length})</h2>
        <button
          type="button"
          className={styles.addButton}
          onClick={() => inputRef.current?.click()}
        >
          <Plus size={16} strokeWidth={2.4} aria-hidden="true" />
          Add images
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          multiple
          hidden
          onChange={(event) => {
            if (event.target.files) onFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>
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
            onKeyDown={(event) => handleRowKeyDown(event, item.id)}
          >
            <span className={`${styles.thumb} checkerboard`} aria-hidden="true">
              {thumbnails[item.id] ? <img src={thumbnails[item.id]} alt="" /> : null}
            </span>
            <div className={styles.info}>
              <strong title={item.fileName}>{item.fileName}</strong>
              <span className={styles.metaLine}>
                {formatBytes(item.size)} ·{" "}
                {item.status === "done" ? (
                  <span className={styles.done}>
                    <CheckCircle2 size={13} strokeWidth={2.4} aria-hidden="true" /> Done
                  </span>
                ) : (
                  <span data-status={item.status}>{statusText(item)}</span>
                )}
              </span>
            </div>
            <div className={styles.rowActions}>
              {item.status === "error" ? (
                <button
                  type="button"
                  className={styles.retry}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRetry(item.id);
                  }}
                >
                  Retry
                </button>
              ) : null}
              <AppTooltip content="Remove">
                <button
                  type="button"
                  className={styles.remove}
                  aria-label={`Remove ${item.fileName}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(item.id);
                  }}
                >
                  <Trash2 size={16} strokeWidth={2} aria-hidden="true" />
                </button>
              </AppTooltip>
            </div>
          </li>
        ))}
      </ul>
      {items.length > 1 ? (
        <div className={styles.footer}>
          <AlertDialog.Root open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <AlertDialog.Trigger asChild>
              <button type="button" className={styles.deleteAll}>
                Remove all images
              </button>
            </AlertDialog.Trigger>
            <AlertDialog.Portal>
              <AlertDialog.Overlay className={styles.dialogOverlay} />
              <AlertDialog.Content className={styles.dialogContent}>
                <AlertDialog.Title className={styles.dialogTitle}>
                  Remove all images?
                </AlertDialog.Title>
                <AlertDialog.Description className={styles.dialogDescription}>
                  This clears every image and result from this page. Your
                  original files on your device are not affected.
                </AlertDialog.Description>
                <div className={styles.dialogActions}>
                  <AlertDialog.Cancel asChild>
                    <button type="button" className={styles.dialogCancel}>
                      Cancel
                    </button>
                  </AlertDialog.Cancel>
                  <AlertDialog.Action asChild>
                    <button
                      type="button"
                      className={styles.dialogConfirm}
                      onClick={() => {
                        onDeleteAll();
                        setDeleteDialogOpen(false);
                      }}
                    >
                      Remove all
                    </button>
                  </AlertDialog.Action>
                </div>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog.Root>
        </div>
      ) : null}
    </div>
  );
}
