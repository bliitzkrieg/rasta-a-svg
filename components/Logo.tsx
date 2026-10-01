import { BRAND, markGeometry } from "@/lib/brandMark";

interface LogoProps {
  className?: string;
  /** Mark size in px; the wordmark scales with it. */
  size?: number;
  /** Hide the wordmark (mark only). */
  markOnly?: boolean;
}

const geometry = markGeometry({ detail: "fine" });

/**
 * The png2svg.io logo: the pixel-to-vector mark plus an HTML wordmark (real
 * text in the site font, so it stays crisp and theme-aware). Decorative:
 * the surrounding link carries the accessible name.
 */
export function Logo({ className, size = 32, markOnly = false }: LogoProps) {
  return (
    <span
      className={`brand-logo${className ? ` ${className}` : ""}`}
      style={{ "--logo-size": `${size}px` } as React.CSSProperties}
      aria-hidden="true"
    >
      <svg viewBox="0 0 64 64" width={size} height={size} className="brand-logo-mark" focusable="false">
        <rect width="64" height="64" rx={geometry.cornerRadius} fill={BRAND.ink} className="brand-logo-tile" />
        <g fill={BRAND.blue}>
          {geometry.cells.map((cell) => (
            <rect
              key={`${cell.x}-${cell.y}`}
              x={cell.x}
              y={cell.y}
              width={cell.size}
              height={cell.size}
              rx="1"
            />
          ))}
        </g>
        <path d={geometry.arcPath} fill={BRAND.orange} />
      </svg>
      {markOnly ? null : (
        <span className="brand-logo-word">
          png2svg<span className="brand-logo-tld">.io</span>
        </span>
      )}
    </span>
  );
}
