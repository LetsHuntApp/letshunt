/**
 * Backwoods Texture — inline-SVG decorative overlays used by the Backwoods
 * theme to give cards a printed-on-paper / field-guide feel without an
 * external texture sprite. Each variant is mounted as a positioned child
 * of a card and inherits its parent's color tokens, so adding a new
 * variant is cheap and theme-aware.
 *
 * The SVGs are intentionally minimal (a handful of `<line>` + `<circle>`
 * elements) so they don't tax mobile compositors.
 */
import React from 'react';

export type PaperTextureVariant = 'fibers' | 'binding' | 'leaflet' | 'wash';

interface PaperTextureProps {
  variant: PaperTextureVariant;
  /** Tailwind positioning utilities (e.g. 'absolute inset-0'). */
  className?: string;
  /** Override default opacity (0..1). */
  opacity?: number;
  /** Override default blend mode (defaults to multiply). */
  blendMode?: 'multiply' | 'overlay' | 'soft-light' | 'screen';
  /** Tone — primary text color of the SVG strokes. Default uses --pb-text. */
  tone?: string;
}

/**
 * `fibers`: scattered ink-flecks and a sheet-edge rule. Prints on
 * general-purpose cards (settings rows, theme tile, weather score
 * badges, etc.).
 */
const FibersTexture: React.FC<{ tone: string }> = ({ tone }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 240 240"
    preserveAspectRatio="xMidYMid slice"
    width="100%"
    height="100%"
    aria-hidden="true"
  >
    {/* Page-edge horizontal rule */}
    <line x1="0" y1="22" x2="240" y2="22" stroke={tone} strokeWidth="0.6" strokeDasharray="1 3" />
    <line x1="0" y1="218" x2="240" y2="218" stroke={tone} strokeWidth="0.6" strokeDasharray="1 3" />
    {/* Sparse ink flecks */}
    <g fill={tone}>
      <circle cx="32" cy="56" r="0.6" />
      <circle cx="118" cy="38" r="0.45" />
      <circle cx="186" cy="64" r="0.7" />
      <circle cx="64" cy="92" r="0.4" />
      <circle cx="144" cy="86" r="0.55" />
      <circle cx="210" cy="120" r="0.5" />
      <circle cx="22" cy="146" r="0.6" />
      <circle cx="92" cy="158" r="0.4" />
      <circle cx="156" cy="178" r="0.55" />
      <circle cx="200" cy="198" r="0.7" />
      <circle cx="50" cy="206" r="0.45" />
      <circle cx="124" cy="220" r="0.5" />
    </g>
    {/* A single fiber line for paper grain direction */}
    <path d="M0 110 Q60 100 120 112 T240 108" fill="none" stroke={tone} strokeWidth="0.4" opacity="0.6" />
  </svg>
);

/**
 * `binding`: vertical stitched spine / binding-edge marks used on the
 * left edge of card rails. Reads as a subtle "page from a book"
 * detail rather than a full texture.
 */
const BindingTexture: React.FC<{ tone: string }> = ({ tone }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 16 240"
    preserveAspectRatio="none"
    width="100%"
    height="100%"
    aria-hidden="true"
  >
    {/* Spine line */}
    <line x1="6" y1="0" x2="6" y2="240" stroke={tone} strokeWidth="0.8" />
    {/* Stitch perforations */}
    {Array.from({ length: 11 }).map((_, i) => (
      <circle key={i} cx="10" cy={12 + i * 22} r="1.4" fill={tone} />
    ))}
  </svg>
);

/**
 * `leaflet`: minimalist topographic contour fragment for the field-map
 * context. Drawn with mid-grade stroke to feel hand-drawn rather than
 * data-perfect.
 */
const LeafletTexture: React.FC<{ tone: string }> = ({ tone }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 200 140"
    preserveAspectRatio="xMidYMid slice"
    width="100%"
    height="100%"
    aria-hidden="true"
  >
    {/* Contour rings */}
    <g fill="none" stroke={tone} strokeWidth="0.7" opacity="0.85">
      <ellipse cx="60" cy="78" rx="22" ry="14" />
      <ellipse cx="60" cy="78" rx="34" ry="22" />
      <ellipse cx="60" cy="78" rx="48" ry="30" />
      <ellipse cx="140" cy="58" rx="18" ry="10" />
      <ellipse cx="140" cy="58" rx="30" ry="18" />
    </g>
    {/* A "you are here" crosshair */}
    <g stroke={tone} strokeWidth="1">
      <line x1="56" y1="78" x2="64" y2="78" />
      <line x1="60" y1="74" x2="60" y2="82" />
    </g>
    {/* Compass tick */}
    <g stroke={tone} strokeWidth="1">
      <line x1="184" y1="26" x2="184" y2="42" />
      <line x1="176" y1="34" x2="192" y2="34" />
    </g>
    {/* Trail dashes */}
    <path
      d="M20 130 Q60 110 100 116 T180 90"
      stroke={tone}
      strokeWidth="1.4"
      strokeDasharray="2 4"
      fill="none"
    />
  </svg>
);

/**
 * `wash`: a horizontal ink-wash gradient reminiscent of aged paper
 * discoloration. Pairs well with overlays that need depth without
 * ornament.
 */
const WashTexture: React.FC<{ tone: string }> = ({ tone }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 120 60"
    preserveAspectRatio="none"
    width="100%"
    height="100%"
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="paperWsh" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor={tone} stopOpacity="0" />
        <stop offset="50%" stopColor={tone} stopOpacity="0.55" />
        <stop offset="100%" stopColor={tone} stopOpacity="0" />
      </linearGradient>
    </defs>
    <rect x="0" y="14" width="120" height="32" fill="url(#paperWsh)" />
    <rect x="0" y="46" width="120" height="8" fill={tone} opacity="0.2" />
  </svg>
);

export const PaperTexture: React.FC<PaperTextureProps> = ({
  variant,
  className = '',
  opacity = 1,
  blendMode = 'multiply',
  tone,
}) => {
  // Default tone reads the Backwoods CSS variable; other themes can pass
  // their own explicitly. We avoid hard-coding so the texture always
  // tracks local CSS scope.
  const resolvedTone = tone ?? 'var(--pb-text, #2a1d10)';
  return (
    <div
      className={`pointer-events-none select-none ${className}`}
      style={{
        mixBlendMode: blendMode,
        opacity,
        color: resolvedTone,
      }}
      aria-hidden="true"
    >
      {variant === 'fibers' && <FibersTexture tone={resolvedTone} />}
      {variant === 'binding' && <BindingTexture tone={resolvedTone} />}
      {variant === 'leaflet' && <LeafletTexture tone={resolvedTone} />}
      {variant === 'wash' && <WashTexture tone={resolvedTone} />}
    </div>
  );
};
