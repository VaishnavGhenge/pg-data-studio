// Every icon here is a verbatim port of an inline <svg> from the pre-React
// renderer (either the Lucide-style 24x24 set via a shared `svg()` helper, or
// a handful of bespoke 16x16 glyphs) — same viewBox/stroke-width/paths, so
// nothing shifts visually.

interface IconProps {
  size?: number;
}

// ---- 24x24 Lucide-style set (stroke-width 2, round caps/joins) ----
function Lucide({ path, size = 14 }: IconProps & { path: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path}
    </svg>
  );
}

export function DatabaseIcon({ size = 15 }: IconProps) {
  return (
    <Lucide
      size={size}
      path={
        <>
          <ellipse cx="12" cy="5" rx="9" ry="3" />
          <path d="M3 5v14a9 3 0 0 0 18 0V5" />
          <path d="M3 12a9 3 0 0 0 18 0" />
        </>
      }
    />
  );
}

export function ArrowUpIcon({ size = 12 }: IconProps) {
  return (
    <Lucide
      size={size}
      path={
        <>
          <path d="m5 12 7-7 7 7" />
          <path d="M12 19V5" />
        </>
      }
    />
  );
}

export function ArrowDownIcon({ size = 12 }: IconProps) {
  return (
    <Lucide
      size={size}
      path={
        <>
          <path d="M12 5v14" />
          <path d="m19 12-7 7-7-7" />
        </>
      }
    />
  );
}

export function ChevronIcon({ size = 13 }: IconProps) {
  return <Lucide size={size} path={<path d="m9 18 6-6-6-6" />} />;
}

export function SchemaIcon({ size = 14 }: IconProps) {
  return (
    <Lucide
      size={size}
      path={
        <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
      }
    />
  );
}

export function TableIcon({ size = 14 }: IconProps) {
  return (
    <Lucide
      size={size}
      path={
        <>
          <rect width="18" height="18" x="3" y="3" rx="2" />
          <path d="M3 9h18" />
          <path d="M3 15h18" />
          <path d="M12 3v18" />
        </>
      }
    />
  );
}

export function ColumnIcon({ size = 14 }: IconProps) {
  return (
    <Lucide
      size={size}
      path={
        <>
          <path d="M8 3v18" />
          <path d="M16 3v18" />
          <path d="M3 12h18" />
        </>
      }
    />
  );
}

export function KeyIcon({ size = 11 }: IconProps) {
  return (
    <Lucide
      size={size}
      path={
        <>
          <circle cx="7.5" cy="15.5" r="5.5" />
          <path d="m21 2-9.6 9.6" />
          <path d="m15.5 7.5 3 3L22 7l-3-3" />
        </>
      }
    />
  );
}

export function UndoIcon({ size = 15 }: IconProps) {
  return (
    <Lucide
      size={size}
      path={
        <>
          <path d="M9 14 4 9l5-5" />
          <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11" />
        </>
      }
    />
  );
}

export function CheckIcon({ size = 15 }: IconProps) {
  return <Lucide size={size} path={<path d="M20 6 9 17l-5-5" />} />;
}

// Success/error indicators for the toast and connection-test result — a
// bare tick/cross reads as an ad-hoc text character (and did, baked
// directly into message strings); a circled glyph reads as a deliberate
// status icon instead.
export function CheckCircleIcon({ size = 14 }: IconProps) {
  return (
    <Lucide
      size={size}
      path={
        <>
          <circle cx="12" cy="12" r="10" />
          <path d="m9 12 2 2 4-4" />
        </>
      }
    />
  );
}

export function AlertCircleIcon({ size = 14 }: IconProps) {
  return (
    <Lucide
      size={size}
      path={
        <>
          <circle cx="12" cy="12" r="10" />
          <line x1="12" x2="12" y1="8" y2="12" />
          <line x1="12" x2="12.01" y1="16" y2="16" />
        </>
      }
    />
  );
}

export function CopyIcon({ size = 12 }: IconProps) {
  return (
    <Lucide
      size={size}
      path={
        <>
          <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
          <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </>
      }
    />
  );
}

export function CornerDownLeftIcon({ size = 11 }: IconProps) {
  return (
    <Lucide
      size={size}
      path={
        <>
          <path d="m9 10-5 5 5 5" />
          <path d="M20 4v7a4 4 0 0 1-4 4H4" />
        </>
      }
    />
  );
}

export function CodeIcon({ size = 14 }: IconProps) {
  return (
    <Lucide
      size={size}
      path={
        <>
          <path d="m16 18 6-6-6-6" />
          <path d="m8 6-6 6 6 6" />
        </>
      }
    />
  );
}

export function PencilIcon({ size = 18 }: IconProps) {
  return (
    <Lucide
      size={size}
      path={
        <>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </>
      }
    />
  );
}

// ---- bespoke 16x16 glyphs (stroke-width 1.1-1.4) ----

export function PlusIcon({ size = 14 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function CloseIcon({ size = 15 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

export function ChevronLeftIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M10 3 5 8l5 5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronRightIcon({ size = 12 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M6 3l5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FunnelIcon({ size = 11 }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path
        d="M2 3h12l-4.6 5.6V13L6.6 14.5V8.6L2 3z"
        stroke="currentColor"
        strokeWidth="1.1"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// The connect/source modal uses a visually distinct 16x16 database glyph
// (thinner stroke, no fill) from the Lucide-style one used in the navigator.
export function DatabaseModalIcon({ size = 20 }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className="modal-icon"
    >
      <ellipse cx="8" cy="3.5" rx="5.5" ry="2.2" stroke="currentColor" strokeWidth="1.1" />
      <path
        d="M2.5 3.5v9c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2v-9"
        stroke="currentColor"
        strokeWidth="1.1"
      />
      <path
        d="M2.5 8c0 1.2 2.5 2.2 5.5 2.2s5.5-1 5.5-2.2"
        stroke="currentColor"
        strokeWidth="1.1"
      />
    </svg>
  );
}

export function RedoIcon({ size = 15 }: IconProps) {
  return (
    <Lucide
      size={size}
      path={
        <>
          <path d="m15 14 5-5-5-5" />
          <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5v0A5.5 5.5 0 0 0 9.5 20H13" />
        </>
      }
    />
  );
}

export function RefreshIcon({ size = 15 }: IconProps) {
  return (
    <Lucide
      size={size}
      path={
        <>
          <path d="M21 12a9 9 0 1 1-2.64-6.36" />
          <path d="M21 3v6h-6" />
        </>
      }
    />
  );
}

export function ColumnsIcon({ size = 14 }: IconProps) {
  return (
    <Lucide
      size={size}
      path={
        <>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M9 4v16M15 4v16" />
        </>
      }
    />
  );
}
