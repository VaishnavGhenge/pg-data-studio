import { Pager } from "./Pager";

interface ToolbarProps {
  previewSql: string;
  quickFilter: string;
  onQuickFilterChange: (text: string) => void;
  visibleRowCount: number;
  ms: number;
  offset: number;
  loadedRowCount: number;
  hasMore: boolean;
  onPrevPage: () => void;
  onNextPage: () => void;
  dirtyCount: number;
  onSave: () => void;
  onRevert: () => void;
}

export function Toolbar({
  previewSql,
  quickFilter,
  onQuickFilterChange,
  visibleRowCount,
  ms,
  offset,
  loadedRowCount,
  hasMore,
  onPrevPage,
  onNextPage,
  dirtyCount,
  onSave,
  onRevert,
}: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="sql">{previewSql}</div>
      <input
        className="filter"
        placeholder="filter loaded rows…"
        aria-label="filter rows"
        value={quickFilter}
        onChange={(e) => onQuickFilterChange(e.target.value)}
      />
      <Pager
        offset={offset}
        loadedRowCount={loadedRowCount}
        hasMore={hasMore}
        onPrev={onPrevPage}
        onNext={onNextPage}
      />
      <div className="meta">
        <b>{visibleRowCount}</b> rows · <b>{ms}</b> ms
      </div>
      <button className="btn ghost" disabled={dirtyCount === 0} onClick={onRevert}>
        Revert
      </button>
      <button className="btn primary" disabled={dirtyCount === 0} onClick={onSave}>
        {dirtyCount ? `Save ${dirtyCount} ${dirtyCount === 1 ? "change" : "changes"}` : "Save changes"}
      </button>
    </div>
  );
}
