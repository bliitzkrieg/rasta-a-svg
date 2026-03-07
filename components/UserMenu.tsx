"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { User } from "lucide-react";
import { useRef, useState, useEffect } from "react";
import styles from "./UserMenu.module.css";

export function UserMenu() {
  const { user } = useUser();
  const { signOut } = useClerk();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", handle);
    return () => document.removeEventListener("click", handle);
  }, [open]);

  if (!user) return null;

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((v) => !v)}
        aria-label="User menu"
        aria-expanded={open}
      >
        <User size={18} strokeWidth={2} aria-hidden />
      </button>
      {open ? (
        <div className={styles.dropdown}>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              void signOut();
              setOpen(false);
            }}
          >
            Sign out
          </button>
        </div>
      ) : null}
    </div>
  );
}
