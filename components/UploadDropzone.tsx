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
      <h2>Upload PNG</h2>
      <p className="dropzone-label">
        Drop one or more PNG files here, then compare the vector output on the left.
      </p>
      <button
        type="button"
        className="dropzone-cta"
        onClick={() => inputRef.current?.click()}
      >
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
  );
}
