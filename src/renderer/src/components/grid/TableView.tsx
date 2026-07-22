// Toolbar/WhereBar stay mounted even with nothing open (matching the old
// renderer, where they were always in the DOM with degenerate empty state);
// only the grid area swaps between the actual table and the "select a
// table" placeholder. The parent keys this whole component by the open
// table's identity so quickFilter resets on table switch; GridTable is
// additionally keyed by the finer-grained *result* identity (offset, sort,
// where, filters) so cell selection/edit resets on any of those too, without
// resetting the quick-filter text along with it (the old renderer only
// cleared the quick filter on openTable/disconnect, not on every
// sort/page/filter change).

import { useState } from "react";
import { useTableState } from "../../state/tableStore";
import { useTableActions } from "../../hooks/useTableActions";
import { buildUpdatePreview } from "../../lib/sqlPreview";
import { Toolbar } from "./Toolbar";
import { WhereBar } from "./WhereBar";
import { GridTable } from "./GridTable";
import { SaveConfirmModal } from "./SaveConfirmModal";

export function TableView() {
  const state = useTableState();
  const { goToPage, applyWhere, save, revertAll } = useTableActions();
  const [quickFilterRaw, setQuickFilterRaw] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const quickFilterTrimmed = quickFilterRaw.trim();
  const visibleRows = quickFilterTrimmed
    ? state.rows.filter((r) =>
        state.columns.some((c) => {
          const v = r[c.name];
          return String(v === null ? "null" : v)
            .toLowerCase()
            .includes(quickFilterTrimmed.toLowerCase());
        })
      )
    : state.rows;

  const dirtyCount = Object.keys(state.dirty).length;

  const resultKey = state.current
    ? [
        state.current.schema,
        state.current.name,
        state.offset,
        state.sortCol ?? "",
        state.sortDir,
        state.where,
        JSON.stringify(state.colFilters),
      ].join("|")
    : "none";

  async function confirmSave(): Promise<void> {
    setSaving(true);
    try {
      await save();
      setPreviewOpen(false);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Toolbar
        previewSql={state.previewSql}
        quickFilter={quickFilterRaw}
        onQuickFilterChange={setQuickFilterRaw}
        visibleRowCount={visibleRows.length}
        ms={state.ms}
        offset={state.offset}
        loadedRowCount={state.rows.length}
        hasMore={state.hasMore}
        onPrevPage={() => goToPage(-1)}
        onNextPage={() => goToPage(1)}
        dirtyCount={dirtyCount}
        onSave={() => setPreviewOpen(true)}
        onRevert={revertAll}
      />
      <WhereBar appliedWhere={state.where} columns={state.columns} onApply={applyWhere} />
      <div className="grid-scroll">
        {state.current ? (
          <GridTable key={resultKey} rows={visibleRows} />
        ) : (
          <div className="empty">Select a table to view its data.</div>
        )}
      </div>
      {state.current && (
        <SaveConfirmModal
          open={previewOpen}
          statements={buildUpdatePreview(state.dirty, state.pk, state.current.schema, state.current.name)}
          saving={saving}
          onConfirm={confirmSave}
          onCancel={() => setPreviewOpen(false)}
        />
      )}
    </>
  );
}
