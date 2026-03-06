"use client";

interface CompareSliderProps {
  originalUrl?: string;
  vectorUrl?: string;
  sliderPosition: number;
  onSliderPositionChange: (value: number) => void;
  aspectRatio?: number;
}

export function CompareSlider({
  originalUrl,
  vectorUrl,
  sliderPosition,
  onSliderPositionChange,
  aspectRatio
}: CompareSliderProps) {
  if (!originalUrl || !vectorUrl) {
    return <p className="muted">Process an image to compare raster and vector output.</p>;
  }

  return (
    <div className="compare-wrap">
      <div className="compare-canvas" style={aspectRatio ? { aspectRatio: `${aspectRatio}` } : undefined}>
        <img src={originalUrl} alt="Original PNG" className="compare-base" />
        <div
          className="compare-overlay"
          style={{ clipPath: `inset(0 ${100 - sliderPosition}% 0 0)` }}
        >
          <img src={vectorUrl} alt="Vector preview" />
        </div>
        <div className="compare-divider" style={{ left: `${sliderPosition}%` }} />
      </div>
      <input
        aria-label="Comparison slider"
        type="range"
        min={0}
        max={100}
        value={sliderPosition}
        onChange={(event) => onSliderPositionChange(Number(event.target.value))}
      />
    </div>
  );
}
