"use client";

import { useId, useState } from "react";

interface MiniCompareProps {
  pngSrc: string;
  svgSrc: string;
  alt: string;
  width: number;
  height: number;
}

/** Small before/after slider for the homepage gallery. */
export function MiniCompare({ pngSrc, svgSrc, alt, width, height }: MiniCompareProps) {
  const [position, setPosition] = useState(50);
  const id = useId();
  return (
    <div className="mini-compare">
      <div className="mini-compare-canvas checkerboard" style={{ aspectRatio: `${width} / ${height}` }}>
        <img src={pngSrc} alt={alt} width={width} height={height} loading="lazy" decoding="async" />
        <div className="mini-compare-vector" style={{ clipPath: `inset(0 0 0 ${position}%)` }}>
          <img src={svgSrc} alt="" width={width} height={height} loading="lazy" decoding="async" />
        </div>
        <span className="mini-compare-divider" style={{ left: `${position}%` }} aria-hidden="true" />
        <span className="mini-compare-chip mini-compare-chip-left">PNG</span>
        <span className="mini-compare-chip mini-compare-chip-right">SVG</span>
      </div>
      <label htmlFor={id} className="sr-only">
        Compare PNG and SVG for {alt}
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={(event) => setPosition(Number(event.target.value))}
        className="mini-compare-range"
      />
    </div>
  );
}
