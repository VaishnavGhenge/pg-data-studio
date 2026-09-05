import { useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent } from "react";
import { ArrowDownIcon, ArrowUpIcon, FunnelIcon } from "../common/icons";
import { showTitleIfTruncated } from "../../lib/truncatedTitle";

interface GridHeaderCellProps {
  column: Column;
  // Position in the column list, not persisted anywhere — just the key used
  // to look up this column's `--col-w-N` custom property (see GridTable).
  index: number;
  // The same value GridTable also feeds into `--col-w-N`, but as a plain
  // number: the CSS var drives layout, this drives the show/hide decision
  // below, which needs to compare against a measured pixel width in JS.
  // `undefined` until the column is actually dragged.
  currentWidth: number | undefined;
  sorted: boolean;
  sortDir: "asc" | "desc";
  filtered: boolean;
  onSortClick: () => void;
  onFunnelClick: (anchor: HTMLElement) => void;
  onResizeStart: (e: MouseEvent<HTMLDivElement>, index: number) => void;
  onAutoFit?: () => void;
  stickyStyle?: CSSProperties;
}

export function GridHeaderCell({
  column,
  index,
  currentWidth,
  sorted,
  sortDir,
  filtered,
  onSortClick,
  onFunnelClick,
  onResizeStart,
  onAutoFit,
  stickyStyle,
}: GridHeaderCellProps) {
  // Falls back to the stylesheet's default (auto width) until the column has
  // actually been dragged — `var()` referencing an undefined custom property
  // is invalid at computed-value time, so the declaration is dropped
  // entirely rather than resolving to some literal fallback.
  const widthVar = `var(--col-w-${index})`;
  const style: CSSProperties = { width: widthVar, maxWidth: widthVar };

  // The default column width fits the name alone; the data type only shows
  // once the column has been dragged wide enough to fit both without
  // clipping either, and hides again if it's dragged back down — exactly
  // mirroring what showing/hiding it would cost in width. `measureRef`
  // is an identical copy of the header's content rendered off-screen
  // (position:absolute, visibility:hidden) purely so its natural,
  // unconstrained width can be read once — a live element that's actually
  // in flow can't answer "how wide would this need to be" without first
  // being that wide, which is exactly the circular question we're avoiding.
  const measureRef = useRef<HTMLDivElement>(null);
  const [fullWidth, setFullWidth] = useState(0);
  useLayoutEffect(() => {
    if (measureRef.current) setFullWidth(measureRef.current.getBoundingClientRect().width);
  }, [column.name, column.dataType, column.isPk]);
  // +2px slack: getBoundingClientRect is subpixel-accurate but currentWidth
  // is a rounded integer, so a bare >= right at the boundary could show the
  // type and then immediately clip it by a hair.
  const showType = currentWidth !== undefined && fullWidth > 0 && currentWidth >= fullWidth + 2;

  return (
    <th
      className={(sorted ? "sorted " : "") + (filtered ? "filtered" : "")}
      style={{ ...style, ...stickyStyle, zIndex: stickyStyle?.position ? 5 : undefined }}
      aria-sort={sorted ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
      onClick={onSortClick}
    >
      <div className="th">
        <button
          className="header-sort"
          title={`${column.name}: ${column.dataType}${column.notNull ? " · NOT NULL" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onSortClick();
          }}
          onMouseEnter={showTitleIfTruncated}
        >
          {column.name}
        </button>
        {column.isPk && <span className="pkbadge">PK</span>}
        {showType && (
          <span className="typ" onMouseEnter={showTitleIfTruncated}>
            {column.dataType}
          </span>
        )}
        <button
          className={"funnel" + (filtered ? " on" : "")}
          title="Filter column"
          aria-label={`Filter ${column.name}`}
          onClick={(e: MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            onFunnelClick(e.currentTarget);
          }}
        >
          <FunnelIcon size={11} />
        </button>
        <span className="sort">
          {sorted && (sortDir === "asc" ? <ArrowUpIcon size={12} /> : <ArrowDownIcon size={12} />)}
        </span>
      </div>
      <div className="th th-measure" ref={measureRef} aria-hidden="true">
        <span>{column.name}</span>
        {column.isPk && <span className="pkbadge">PK</span>}
        <span className="typ">{column.dataType}</span>
      </div>
      <div
        className="col-resizer"
        onMouseDown={(e) => {
          e.stopPropagation();
          onResizeStart(e, index);
        }}
        onClick={(e) => e.stopPropagation()}
        onDoubleClick={(e) => {
          e.stopPropagation();
          onAutoFit?.();
        }}
      />
    </th>
  );
}
