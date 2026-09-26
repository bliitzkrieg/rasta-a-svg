export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 350 72"
      className={className}
      role="img"
      aria-label="png2svg.io home"
    >
      {/* Back document: PNG, raster pixels */}
      <path
        d="M6 22a10 10 0 0 1 10-10h22l14 14v26a10 10 0 0 1-10 10H16a10 10 0 0 1-10-10Z"
        fill="#2281b3"
      />
      <path d="M38 12l14 14H38Z" fill="#1a6a96" />
      <g fill="#ffffff" opacity="0.92">
        <rect x="19" y="32" width="5.5" height="5.5" rx="1" />
        <rect x="28" y="32" width="5.5" height="5.5" rx="1" />
        <rect x="37" y="32" width="5.5" height="5.5" rx="1" />
        <rect x="19" y="41" width="5.5" height="5.5" rx="1" />
        <rect x="28" y="41" width="5.5" height="5.5" rx="1" />
        <rect x="37" y="41" width="5.5" height="5.5" rx="1" />
        <rect x="19" y="50" width="5.5" height="5.5" rx="1" />
        <rect x="28" y="50" width="5.5" height="5.5" rx="1" />
        <rect x="37" y="50" width="5.5" height="5.5" rx="1" />
      </g>
      {/* Front document: SVG, bezier vector */}
      <path
        d="M44 18a10 10 0 0 1 10-10h24l16 16v28a10 10 0 0 1-10 10H54a10 10 0 0 1-10-10Z"
        fill="#fb6a15"
      />
      <path d="M78 8l16 16H78Z" fill="#e55a08" />
      <path
        d="M60 37l-6 7M78 37l6 7"
        stroke="#ffffff"
        strokeWidth="1.5"
        opacity="0.55"
      />
      <path
        d="M54 44c8-14 22-14 30 0"
        stroke="#ffffff"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
      />
      <rect x="51.5" y="41.5" width="5" height="5" fill="#ffffff" />
      <rect x="81.5" y="41.5" width="5" height="5" fill="#ffffff" />
      {/* Wordmark: inherits theme ink via currentColor */}
      <text
        x="106"
        y="48"
        fontFamily="Manrope, 'Segoe UI', system-ui, sans-serif"
        fontSize="40"
        fontWeight="800"
        letterSpacing="-1"
        fill="currentColor"
        textLength="236"
        lengthAdjust="spacingAndGlyphs"
      >
        png2svg.io
      </text>
    </svg>
  );
}
