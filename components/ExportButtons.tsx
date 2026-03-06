"use client";

interface ExportButtonsProps {
  disabled?: boolean;
  onExport: (type: "svg" | "eps" | "dxf") => void;
}

export function ExportButtons({ disabled, onExport }: ExportButtonsProps) {
  return (
    <div className="export-buttons">
      <button type="button" disabled={disabled} onClick={() => onExport("svg")}>
        Download SVG
      </button>
      <button type="button" disabled={disabled} onClick={() => onExport("eps")}>
        Download EPS
      </button>
      <button type="button" disabled={disabled} onClick={() => onExport("dxf")}>
        Download DXF
      </button>
    </div>
  );
}
