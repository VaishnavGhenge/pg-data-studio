import { useEffect, useRef, useState } from "react";
import { Sidebar } from "../navigator/Sidebar";
import { SourceModal } from "../navigator/SourceModal";
import { Splitter } from "./Splitter";
import { TableView } from "../grid/TableView";
import { useSplitterWidth } from "../../hooks/useSplitterWidth";
import { useSourcesState } from "../../state/sourcesStore";
import { useSourceActions } from "../../hooks/useSourceActions";
import { useTableState } from "../../state/tableStore";
import { useTableActions } from "../../hooks/useTableActions";
import { useToast } from "../../state/toastStore";
import { readPreference, writePreference, tableId } from "../../lib/preferences";

export function AppShell() {
  const { sideRef, dragging, onMouseDown } = useSplitterWidth();
  const { sources, connectedId } = useSourcesState();
  const { refreshSources } = useSourceActions();
  const state = useTableState();
  const { current } = state;
  const { openTable, closeTab } = useTableActions();
  const [favorites, setFavorites] = useState<{ schema: string; name: string }[]>([]);
  const [recent, setRecent] = useState<{ schema: string; name: string }[]>([]);
  const { show: toast } = useToast();
  const [sourceModal, setSourceModal] = useState<{ open: boolean; source: Source | null }>({
    open: false,
    source: null,
  });
  const activeTabRef = useRef<HTMLDivElement | null>(null);

  // A tab opened from the sidebar is appended at the end of the strip, which is
  // off-screen once there are more tabs than fit. Pull it back into view.
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [current?.schema, current?.name, state.tabs.length]);

  // Load saved sources on boot; if there are none yet, prompt to add one —
  // matches the old renderer's boot().
  useEffect(() => {
    (async () => {
      const list = await refreshSources();
      if (!list.length) setSourceModal({ open: true, source: null });
    })().catch((error) => toast(error instanceof Error ? error.message : String(error), true));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setFavorites(readPreference("favorites:" + connectedId, []));
    setRecent(readPreference("recent:" + connectedId, []));
    if (connectedId) {
      const last = readPreference<{ schema: string; name: string } | null>(
        "last-table:" + connectedId,
        null,
      );
      if (last) void openTable(last.schema, last.name);
    }
  }, [connectedId]);
  useEffect(() => {
    if (!current || !connectedId) return;
    writePreference("last-table:" + connectedId, current);
    setRecent((previous) => {
      const next = [
        current,
        ...previous.filter(
          (t) => tableId(t.schema, t.name) !== tableId(current.schema, current.name),
        ),
      ].slice(0, 8);
      writePreference("recent:" + connectedId, next);
      return next;
    });
  }, [current?.schema, current?.name, connectedId]);
  function toggleFavorite(schema: string, name: string) {
    const id = tableId(schema, name);
    const next = favorites.some((t) => tableId(t.schema, t.name) === id)
      ? favorites.filter((t) => tableId(t.schema, t.name) !== id)
      : [...favorites, { schema, name }];
    setFavorites(next);
    writePreference("favorites:" + connectedId, next);
  }

  // Remounts TableView (and its quick-filter text) whenever the open table
  // changes; GridTable inside it remounts on the finer-grained result
  // identity (see TableView).
  const tableKey = JSON.stringify([connectedId, current?.schema, current?.name]);

  return (
    <div className="app">
      <Sidebar
        sideRef={sideRef}
        favorites={favorites}
        recent={recent}
        onOpenTable={(schema, table) => openTable(schema, table)}
        onNewSource={() => setSourceModal({ open: true, source: null })}
        onEditSource={(id) => {
          const src = sources.find((s) => s.id === id) ?? null;
          setSourceModal({ open: true, source: src });
        }}
      />
      <Splitter dragging={dragging} onMouseDown={onMouseDown} />
      <section className="main">
        {state.tabs.length > 0 && (
          <div
            className="table-tabs"
            role="tablist"
            aria-label="Open tables"
            onKeyDown={(e) => {
              if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
              const buttons = Array.from(
                e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
              );
              const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
              if (index < 0) return;
              e.preventDefault();
              const next =
                buttons[
                  (index + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length
                ];
              next.focus();
              next.click();
            }}
          >
            {state.tabs.map((tab) => {
              const id = tableId(tab.schema, tab.name),
                active = current?.schema === tab.schema && current.name === tab.name;
              const edited =
                Object.keys(active ? state.dirty : (state.snapshots[id]?.dirty ?? {})).length > 0;
              const favorite = favorites.some((t) => tableId(t.schema, t.name) === id);
              return (
                <div
                  className={"table-tab" + (active ? " active" : "")}
                  key={id}
                  ref={active ? activeTabRef : undefined}
                >
                  <button
                    className="favorite-button"
                    aria-label={(favorite ? "Unfavorite " : "Favorite ") + tab.name}
                    aria-pressed={favorite}
                    onClick={() => toggleFavorite(tab.schema, tab.name)}
                  >
                    {favorite ? "★" : "☆"}
                  </button>
                  <button
                    role="tab"
                    aria-selected={active}
                    tabIndex={active ? 0 : -1}
                    onClick={() => openTable(tab.schema, tab.name)}
                  >
                    {tab.schema}.{tab.name}
                    {edited ? " ●" : ""}
                  </button>
                  <button
                    aria-label={"Close " + tab.name}
                    onClick={() => closeTab(tab.schema, tab.name)}
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
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
