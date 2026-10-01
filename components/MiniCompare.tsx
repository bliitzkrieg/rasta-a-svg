"use client";

import { useId, useRef, type CSSProperties } from "react";
import { ChevronsLeftRight } from "lucide-react";

interface MiniCompareProps {
  pngSrc: string;
  svgSrc: string;
  alt: string;
  width: number;
  height: number;
}

/**
 * Small before/after slider for the homepage gallery.
 *
 * Performance: the SVG (hundreds of KB, thousands of paths) is the static
 * bottom layer and is rasterized once; only the cheap PNG layer on top is
 * clipped. The position is written straight to a CSS variable during a
 * drag, so moving the divider never re-renders React or re-paints the SVG.
 */
export function MiniCompare({ pngSrc, svgSrc, alt, width, height }: MiniCompareProps) {
  const id = useId();
  const canvasRef = useRef<HTMLDivElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const dragging = useRef(false);

  const setPosition = (percent: number) => {
    const value = Math.max(0, Math.min(100, percent));
    canvasRef.current?.style.setProperty("--pos", `${value}%`);
    if (rangeRef.current) rangeRef.current.value = String(Math.round(value));
  };

  const fromPointer = (clientX: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setPosition(((clientX - rect.left) / rect.width) * 100);
  };

  const stop = () => {
    dragging.current = false;
  };

  return (
    <div className="mini-compare">
      <div
        ref={canvasRef}
        className="mini-compare-canvas checkerboard"
        style={{ "--pos": "50%" } as CSSProperties}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          dragging.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          fromPointer(event.clientX);
        }}
        onPointerMove={(event) => {
          if (dragging.current) fromPointer(event.clientX);
        }}
        onPointerUp={stop}
        onPointerCancel={stop}
        onLostPointerCapture={stop}
      >
        {/* Bottom layer: the SVG, never clipped, so it is painted once. */}
        <img
          className="mini-compare-svg"
          src={svgSrc}
          alt={`${alt}, converted to SVG`}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
        {/* Top layer: the original PNG, clipped to the left of the divider. */}
        <img
          className="mini-compare-png"
          src={pngSrc}
          alt={`${alt}, original PNG`}
          width={width}
          height={height}
          loading="lazy"
          decoding="async"
          draggable={false}
        />
        <span className="mini-compare-divider" aria-hidden="true">
          <span className="mini-compare-handle">
            <ChevronsLeftRight size={14} strokeWidth={2.6} />
          </span>
        </span>
        <span className="mini-compare-chip mini-compare-chip-left">PNG</span>
        <span className="mini-compare-chip mini-compare-chip-right">SVG</span>
      </div>
      <label htmlFor={id} className="sr-only">
        Compare PNG and SVG for {alt}
      </label>
      <input
        ref={rangeRef}
        id={id}
        type="range"
        min={0}
        max={100}
        defaultValue={50}
        className="sr-only"
        onChange={(event) => setPosition(Number(event.target.value))}
      />
    </div>
  );
}
