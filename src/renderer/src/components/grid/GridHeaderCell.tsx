import type { MouseEvent } from "react";
import { FunnelIcon } from "../common/icons";

interface GridHeaderCellProps {
  column: Column;
  sorted: boolean;
  sortDir: "asc" | "desc";
  filtered: boolean;
  onSortClick: () => void;
  onFunnelClick: (anchor: HTMLElement) => void;
}

export function GridHeaderCell({
  column,
  sorted,
  sortDir,
  filtered,
  onSortClick,
  onFunnelClick,
}: GridHeaderCellProps) {
  return (
    <th
      className={(sorted ? "sorted " : "") + (filtered ? "filtered" : "")}
      onClick={onSortClick}
    >
      <div className="th">
        <span>{column.name}</span>
        {column.isPk && <span className="pkbadge">PK</span>}
        <span className="typ">{column.dataType}</span>
        <span
          className={"funnel" + (filtered ? " on" : "")}
          title="Filter column"
          onClick={(e: MouseEvent<HTMLSpanElement>) => {
            e.stopPropagation();
            onFunnelClick(e.currentTarget);
          }}
        >
          <FunnelIcon size={11} />
        </span>
        <span className="sort">{sorted ? (sortDir === "asc" ? "▲" : "▼") : ""}</span>
      </div>
    </th>
  );
}
