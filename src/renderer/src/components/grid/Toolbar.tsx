import { Pager } from "./Pager";
import { useToast } from "../../state/toastStore";
import { CheckIcon, CopyIcon, UndoIcon } from "../common/icons";

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
  onSave: () => void; // requests the save-preview modal, not an immediate write
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
  const { show: toast } = useToast();

  async function copySql(): Promise<void> {
    if (!previewSql) return;
    try {
      await navigator.clipboard.writeText(previewSql);
      toast("Copied query");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't copy to clipboard", true);
    }
  }

  return (
    <div className="toolbar">
      <div className="sql-wrap">
        <div className={previewSql ? "sql" : "sql sql-empty"}>
          {previewSql || "No query yet — select a table"}
        </div>
        {previewSql && (
          <button className="sql-copy" title="Copy query" aria-label="Copy query" onClick={copySql}>
            <CopyIcon size={12} />
          </button>
        )}
      </div>
      <input
        className="filter"
        placeholder="filter loaded rows…"
        aria-label="filter rows"
        value={quickFilter}
        onChange={(e) => onQuickFilterChange(e.target.value)}
      />
      <div className="toolbar-divider" />
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
      <div className="toolbar-divider" />
      <button
        className="btn ghost icon-only"
        title="Revert all changes"
        aria-label="Revert all changes"
        disabled={dirtyCount === 0}
        onClick={onRevert}
      >
        <UndoIcon size={15} />
      </button>
      <button
        className="btn primary icon-only"
        title={dirtyCount ? `Save ${dirtyCount} ${dirtyCount === 1 ? "change" : "changes"}` : "Save changes"}
        aria-label="Save changes"
        disabled={dirtyCount === 0}
        onClick={onSave}
      >
        <CheckIcon size={15} />
        {dirtyCount > 0 && <span className="toolbar-badge">{dirtyCount}</span>}
      </button>
    </div>
  );
}
