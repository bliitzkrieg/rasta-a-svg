"use client";

import { useRef } from "react";

interface UploadDropzoneProps {
  onFiles: (files: FileList | File[]) => void;
}

export function UploadDropzone({ onFiles }: UploadDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        if (event.dataTransfer.files.length > 0) {
          onFiles(event.dataTransfer.files);
        }
      }}
      className="dropzone"
    >
      <p>Drop PNG files here or use file picker</p>
      <button type="button" onClick={() => inputRef.current?.click()}>
        Select PNG files
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
  );
}
