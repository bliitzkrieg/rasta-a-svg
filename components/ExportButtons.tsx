"use client";

import { AppTooltip } from "./AppTooltip";

interface ExportButtonsProps {
  disabled?: boolean;
  onExport: (type: "svg" | "svg-clean" | "eps" | "dxf") => void;
  variant?: "default" | "floating";
}

export function ExportButtons({
  disabled,
  onExport,
  variant = "default",
}: ExportButtonsProps) {
  return (
    <div className={`export-buttons export-buttons--${variant}`}>
      <AppTooltip content="Download SVG">
        <button
          type="button"
          className="btn-primary"
          disabled={disabled}
          onClick={() => onExport("svg")}
          aria-label="Download SVG"
        >
          SVG
        </button>
      </AppTooltip>
      <AppTooltip content="Download EPS">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onExport("eps")}
          aria-label="Download EPS"
        >
          EPS
        </button>
      </AppTooltip>
      <AppTooltip content="Download DXF">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onExport("dxf")}
          aria-label="Download DXF"
        >
          DXF
        </button>
      </AppTooltip>
      <AppTooltip content="Download SVG without pixel corrections (for cutting)">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onExport("svg-clean")}
          aria-label="Download clean SVG for cutting"
        >
          Clean SVG
        </button>
      </AppTooltip>
    </div>
  );
}
