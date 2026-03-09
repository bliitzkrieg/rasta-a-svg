"use client";

import type { ConversionResult, QueueStatus } from "@/types/vector";
import { CompareSlider } from "./CompareSlider";

interface PreviewPaneProps {
  result?: ConversionResult;
  originalUrl?: string;
  vectorUrl?: string;
  status?: QueueStatus;
  progress?: number;
  activePhase?: string;
  sliderPosition: number;
  onSliderPositionChange: (value: number) => void;
  onExport: (type: "svg" | "eps" | "dxf") => void;
  onFiles?: (files: FileList | File[]) => void;
  onUpgrade?: () => void;
}

export function PreviewPane({
  result,
  originalUrl,
  vectorUrl,
  status,
  progress,
  activePhase,
  sliderPosition,
  onSliderPositionChange,
  onExport,
  onFiles,
  onUpgrade,
}: PreviewPaneProps) {
  return (
    <div className="panel preview-stage">
      <CompareSlider
        originalUrl={originalUrl}
        vectorUrl={vectorUrl}
        status={status}
        progress={progress}
        activePhase={activePhase}
        sliderPosition={sliderPosition}
        onSliderPositionChange={onSliderPositionChange}
        aspectRatio={result ? result.width / result.height : undefined}
        onExport={onExport}
        onFiles={onFiles}
        onUpgrade={onUpgrade}
      />
    </div>
  );
}
