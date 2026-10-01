"use client";

import type { ReactNode } from "react";
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
  downloadControl?: ReactNode;
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
  downloadControl,
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
        imageWidth={result?.width}
        imageHeight={result?.height}
        downloadControl={downloadControl}
      />
    </div>
  );
}
