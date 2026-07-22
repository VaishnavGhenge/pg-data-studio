import { useEffect, useState } from "react";
import { Sidebar } from "../navigator/Sidebar";
import { SourceModal } from "../navigator/SourceModal";
import { Splitter } from "./Splitter";
import { TableView } from "../grid/TableView";
import { useSplitterWidth } from "../../hooks/useSplitterWidth";
import { useSourcesState } from "../../state/sourcesStore";
import { useSourceActions } from "../../hooks/useSourceActions";
import { useTableState } from "../../state/tableStore";
import { useTableActions } from "../../hooks/useTableActions";

export function AppShell() {
  const { sideRef, dragging, onMouseDown } = useSplitterWidth();
  const { sources } = useSourcesState();
  const { refreshSources } = useSourceActions();
  const { current } = useTableState();
  const { openTable } = useTableActions();
  const [sourceModal, setSourceModal] = useState<{ open: boolean; source: Source | null }>({
    open: false,
    source: null,
  });

  // Load saved sources on boot; if there are none yet, prompt to add one —
  // matches the old renderer's boot().
  useEffect(() => {
    (async () => {
      const list = await refreshSources();
      if (!list.length) setSourceModal({ open: true, source: null });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Remounts TableView (and its quick-filter text) whenever the open table
  // changes; GridTable inside it remounts on the finer-grained result
  // identity (see TableView).
  const tableKey = current ? `${current.schema}.${current.name}` : "none";

  return (
    <div className="app">
      <Sidebar
        sideRef={sideRef}
        onOpenTable={(schema, table) => openTable(schema, table)}
        onNewSource={() => setSourceModal({ open: true, source: null })}
        onEditSource={(id) => {
          const src = sources.find((s) => s.id === id) ?? null;
          setSourceModal({ open: true, source: src });
        }}
      />
      <Splitter dragging={dragging} onMouseDown={onMouseDown} />
      <section className="main">
        <TableView key={tableKey} />
      </section>
      <SourceModal
        open={sourceModal.open}
        source={sourceModal.source}
        onClose={() => setSourceModal({ open: false, source: null })}
      />
    </div>
  );
}
