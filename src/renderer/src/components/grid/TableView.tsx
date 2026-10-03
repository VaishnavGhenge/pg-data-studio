import { useEffect, useMemo, useRef, useState } from "react";
import { useTableState, useWorkspaceRequests } from "../../state/tableStore";
import { useSourcesState } from "../../state/sourcesStore";
import { useTableActions } from "../../hooks/useTableActions";
import { useToast } from "../../state/toastStore";
import { buildUpdatePreview } from "../../lib/sqlPreview";
import { dirtyKey, groupDirtyByRow } from "../../lib/dirty";
import { displayRowKey } from "../../lib/rowKey";
import { InteractiveGrid } from "./InteractiveGrid";
import { RefreshIcon, UndoIcon, RedoIcon, CloseIcon } from "../common/icons";
import { WhereBar } from "./WhereBar";
import { Pager } from "./Pager";
import { SaveConfirmModal } from "./SaveConfirmModal";

export function TableView() {
  const state = useTableState();
  const sources = useSourcesState();
  const actions = useTableActions();
  const requests = useWorkspaceRequests();
  const { show: toast } = useToast();
  const [quickFilter, setQuickFilter] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [count, setCount] = useState<string | null>(null);
  const [counting, setCounting] = useState(false);
  const [countError, setCountError] = useState("");
  const countVersion = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const source = sources.sources.find((s) => s.id === sources.connectedId);
  const dirtyCount = Object.keys(state.dirty).length;
  const changedRows = groupDirtyByRow(state.dirty).length;
  const blocked = state.loading || saving || !!sources.connectingId;
  const hasFilters = !!state.where || Object.keys(state.colFilters).length > 0;
  const visibleRows = useMemo(() => {
    const search = quickFilter.trim().toLowerCase();
    if (!search) return state.rows;
    return state.rows.filter((row, index) => {
      const key = displayRowKey(state.pk, row, index);
      return state.columns.some((col) => {
        const edit = state.dirty[dirtyKey(key, col.name)];
        const value = edit ? edit.val : row[col.name];
        return String(value === null ? "null" : value)
          .toLowerCase()
          .includes(search);
      });
    });
  }, [state.rows, state.columns, state.pk, state.dirty, quickFilter]);
  const resultKey = JSON.stringify([
    state.current,
    state.offset,
    state.pageSize,
    state.sortCol,
    state.sortDir,
    state.where,
    state.colFilters,
    quickFilter,
  ]);
  useEffect(() => {
    countVersion.current++;
    setCount(null);
    setCountError("");
    setCounting(false);
    return () => {
      countVersion.current++;
    };
  }, [state.rows, state.where, state.colFilters]);
  useEffect(() => {
    function key(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || document.querySelector('[aria-modal="true"]')) return;
      if (e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      const target = e.target as HTMLElement;
      if (target.closest("input, textarea, [contenteditable=true]")) return;
      if (e.key === "Enter" && dirtyCount && !blocked) {
        e.preventDefault();
        setPreviewOpen(true);
      }
      if (e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) actions.redo();
        else actions.undo();
      }
      if (e.key.toLowerCase() === "y") {
        e.preventDefault();
        actions.redo();
      }
    }
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  async function exactCount() {
    if (!state.current) return;
    const version = ++countVersion.current;
    const workspaceVersion = requests.version;
    setCounting(true);
    setCountError("");
    try {
      const res = await window.api.countRows(state.current.schema, state.current.name, {
        where: state.where,
        filters: Object.entries(state.colFilters).map(([column, f]) => ({ column, ...f })),
      });
      if (version !== countVersion.current || !requests.isCurrent(workspaceVersion)) return;
      if (!res.ok) throw Error(res.error);
      setCount(res.data);
    } catch (e) {
      if (version === countVersion.current)
        setCountError(e instanceof Error ? e.message : String(e));
    } finally {
      if (version === countVersion.current) setCounting(false);
    }
  }
  async function confirmSave() {
    setSaving(true);
    try {
      if (await actions.save()) setPreviewOpen(false);
    } finally {
      setSaving(false);
    }
  }
  if (!state.current)
    return (
      <div className="workspace-empty">
        <h2>{source ? "Choose a table" : "Connect to a database"}</h2>
        <p>
          {source
            ? "Open a table from the sidebar. Your tables stay available in tabs."
            : "Use + in the sidebar to add a connection, or choose a saved source."}
        </p>
      </div>
    );
  return (
    <>
      <div className="table-heading">
        <strong>
          {source?.name ?? "Database"} <span>/ {state.current.schema} /</span> {state.current.name}
        </strong>
        {!state.loading && state.columns.length > 0 && (
          <span className="badge">
            {state.pk.length ? "Editable" : "Read-only · no primary key"}
          </span>
        )}
      </div>
      <div className="toolbar">
        <div className="search-wrap">
          <input
            ref={searchRef}
            className="filter page-search"
            placeholder="Search this page…"
            aria-label="Search this page"
            value={quickFilter}
            onChange={(e) => setQuickFilter(e.target.value)}
          />
          {quickFilter && (
            <button
              className="search-clear"
              aria-label="Clear search"
              onClick={() => setQuickFilter("")}
            >
              <CloseIcon size={12} />
            </button>
          )}
        </div>
        <button
          className="btn ghost icon-only"
          title="Refresh this page of rows"
          aria-label="Refresh"
          disabled={blocked}
          onClick={() => actions.refresh()}
        >
          <RefreshIcon size={14} />
        </button>
        <span className="spacer" />
        <button
          className="btn ghost icon-only"
          title="Undo pending edit (⌘/Ctrl Z)"
          aria-label="Undo"
          disabled={!state.past.length || blocked}
          onClick={actions.undo}
        >
          <UndoIcon size={14} />
        </button>
        <button
          className="btn ghost icon-only"
          title="Redo pending edit (⌘/Ctrl Shift Z)"
          aria-label="Redo"
          disabled={!state.future.length || blocked}
          onClick={actions.redo}
        >
          <RedoIcon size={14} />
        </button>
        {/* Revert all is dead weight with nothing to revert, so it only shows
            up once there are pending edits. Save stays put: it anchors the
            row and its count is the edit tally. */}
        {dirtyCount > 0 && (
          <>
            <span className="toolbar-divider" />
            <button className="btn ghost" disabled={blocked} onClick={actions.revertAll}>
              Revert all
            </button>
          </>
        )}
        <button
          className="btn primary"
          title="Review changes (⌘/Ctrl Enter)"
          disabled={!dirtyCount || blocked}
          onClick={() => setPreviewOpen(true)}
        >
          Save changes{dirtyCount ? " (" + dirtyCount + ")" : ""}
        </button>
      </div>
      <WhereBar
        appliedWhere={state.where}
        columns={state.columns}
        tableName={state.current.name}
        onApply={actions.applyWhere}
        disabled={blocked}
      />
      {/* The WHERE clause is already spelled out in the bar above with its own
          clear button, so it gets no chip here. This row is for the filters
          that have nowhere else to show themselves. */}
      {(Object.keys(state.colFilters).length > 0 || state.sortCol) && (
        <div className="filter-chips">
          {Object.entries(state.colFilters).map(([col, f]) => (
            <button key={col} disabled={blocked} onClick={() => actions.applyColFilter(col, null)}>
              {col} {f.op} {f.value} ×
            </button>
          ))}
          <button
            disabled={blocked}
            onClick={() => {
              setQuickFilter("");
              void actions.resetFilters();
            }}
          >
            Reset filters & sort
          </button>
        </div>
      )}
      {state.loading && (
        <div className="query-feedback" role="status">
          {state.rows.length ? "Refreshing rows…" : "Loading rows…"}
        </div>
      )}
      {state.error && (
        <div className="query-error" role="alert">
          <span>
            {state.error}
            {state.rows.length > 0 && " · Showing previous results."}
          </span>
          <button className="btn ghost" onClick={actions.retry}>
            Retry
          </button>
        </div>
      )}
      <InteractiveGrid
        key={resultKey}
        rows={visibleRows}
        empty={
          !state.loading && !state.error && visibleRows.length === 0 ? (
            <>
              <strong>
                {hasFilters || quickFilter ? "No matching rows" : "This table is empty"}
              </strong>
              {(hasFilters || quickFilter) && (
                <button
                  className="btn ghost"
                  onClick={() => {
                    setQuickFilter("");
                    void actions.resetFilters();
                  }}
                >
                  Clear filters
                </button>
              )}
            </>
          ) : null
        }
        status={
          <>
            <Pager
              offset={state.offset}
              loadedRowCount={state.rows.length}
              hasMore={state.hasMore}
              disabled={blocked}
              onPrev={() => actions.goToPage(-1)}
              onNext={() => actions.goToPage(1)}
            />
            <label>
              Page size{" "}
              <select
                aria-label="Page size"
                disabled={blocked}
                value={state.pageSize}
                onChange={(e) => actions.refresh(Number(e.target.value))}
              >
                {[200, 500, 1000].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <span>
              {visibleRows.length} shown · {state.ms} ms
            </span>
            {dirtyCount > 0 && (
              <span className="pending-count">
                {dirtyCount} {dirtyCount === 1 ? "cell" : "cells"} in {changedRows}{" "}
                {changedRows === 1 ? "row" : "rows"} changed
              </span>
            )}
            {count !== null ? (
              <span>{count} matching rows</span>
            ) : (
              <button className="btn ghost" disabled={blocked || counting} onClick={exactCount}>
                {counting ? "Counting…" : "Count matching rows"}
              </button>
            )}
            {state.previewSql && (
              <details className="query-preview">
                <summary>SQL</summary>
                <div>
                  <pre>{state.previewSql}</pre>
                  <button
                    className="btn ghost"
                    onClick={() =>
                      navigator.clipboard.writeText(state.previewSql).then(
                        () => toast("Copied query"),
                        () => toast("Could not copy query", true),
                      )
                    }
                  >
                    Copy SQL
                  </button>
                </div>
              </details>
            )}
            {countError && (
              <span className="inline-error" role="alert">
                {countError}
              </span>
            )}
          </>
        }
      />
      <SaveConfirmModal
        open={previewOpen}
        statements={buildUpdatePreview(
          state.dirty,
          state.pk,
          state.current.schema,
          state.current.name,
        )}
        changes={Object.values(state.dirty)}
        saving={saving}
        onConfirm={confirmSave}
        onCancel={() => setPreviewOpen(false)}
      />
    </>
  );
}
