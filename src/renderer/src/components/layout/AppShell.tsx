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
import { Titlebar } from "./Titlebar";
import { QuickOpen } from "./QuickOpen";
import { TableIcon, CloseIcon } from "../common/icons";
import { FavoriteButton } from "../common/FavoriteButton";

export function AppShell() {
  const { sideRef, dragging, onMouseDown } = useSplitterWidth();
  const { sources, connectedId } = useSourcesState();
  const { refreshSources } = useSourceActions();
  const state = useTableState();
  const { current } = state;
  const { openTable, closeTab } = useTableActions();
  const [favorites, setFavorites] = useState<{ schema: string; name: string }[]>([]);
  const { show: toast } = useToast();
  const [sourceModal, setSourceModal] = useState<{ open: boolean; source: Source | null }>({
    open: false,
    source: null,
  });
  const activeTabRef = useRef<HTMLDivElement | null>(null);
  const [quickOpen, setQuickOpen] = useState(false);
  const newSource = () => setSourceModal({ open: true, source: null });
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "k" &&
        !document.querySelector('[aria-modal="true"]')
      ) {
        event.preventDefault();
        setQuickOpen(true);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

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

  // Optional call: the test and performance harnesses stub window.api without it.
  useEffect(
    () =>
      window.api.onSourcesChanged?.(() => {
        refreshSources().catch(() => {});
      }),
    [refreshSources],
  );

  useEffect(() => {
    setFavorites(readPreference("favorites:" + connectedId, []));
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
  }, [current?.schema, current?.name, connectedId]);
  function toggleFavorite(schema: string, name: string) {
    const id = tableId(schema, name);
    const next = favorites.some((t) => tableId(t.schema, t.name) === id)
      ? favorites.filter((t) => tableId(t.schema, t.name) !== id)
      : [...favorites, { schema, name }];
    setFavorites(next);
    writePreference("favorites:" + connectedId, next);
  }

  async function closeFromTab(schema: string, name: string, control: HTMLElement) {
    await closeTab(schema, name);
    requestAnimationFrame(() => {
      if (control.isConnected) return;
      const next =
        activeTabRef.current?.querySelector<HTMLButtonElement>('[role="tab"]') ??
        document.querySelector<HTMLButtonElement>(".welcome-actions button");
      next?.focus();
    });
  }

  // Remounts TableView (and its quick-filter text) whenever the open table
  // changes; GridTable inside it remounts on the finer-grained result
  // identity (see TableView).
  const tableKey = JSON.stringify([connectedId, current?.schema, current?.name]);

  return (
    <>
      <Titlebar onQuickOpen={() => setQuickOpen(true)} />
      <div className="app">
        <Sidebar
          sideRef={sideRef}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          onOpenTable={(schema, table) => openTable(schema, table)}
          onNewSource={newSource}
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
                const buttons = Array.from(
                  e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
                );
                const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                if (index < 0) return;
                if (e.key === "Delete") {
                  e.preventDefault();
                  const tab = state.tabs[index];
                  void closeFromTab(tab.schema, tab.name, buttons[index]);
                  return;
                }
                if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
                e.preventDefault();
                const next =
                  buttons[
                    e.key === "Home"
                      ? 0
                      : e.key === "End"
                        ? buttons.length - 1
                        : (index + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) %
                          buttons.length
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
                      role="tab"
                      aria-selected={active}
                      aria-label={`${tab.schema}.${tab.name}${edited ? " · unsaved changes" : ""}`}
                      title={`${tab.schema}.${tab.name}`}
                      tabIndex={active ? 0 : -1}
                      onClick={() => openTable(tab.schema, tab.name)}
                    >
                      <TableIcon size={13} />
                      <span className="tab-name">{tab.name}</span>
                      <span className="tab-schema">{tab.schema}</span>
                      {edited && (
                        <span
                          className="tab-dirty"
                          title="Unsaved changes"
                          aria-label="Unsaved changes"
                        />
                      )}
                    </button>
                    <FavoriteButton
                      schema={tab.schema}
                      name={tab.name}
                      favorite={favorite}
                      onToggle={() => toggleFavorite(tab.schema, tab.name)}
                    />
                    <button
                      className="tab-close"
                      aria-label={"Close " + tab.name}
                      title={`Close ${tab.schema}.${tab.name}`}
                      onClick={(event) =>
                        void closeFromTab(tab.schema, tab.name, event.currentTarget)
                      }
                    >
                      <CloseIcon size={12} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <TableView
            key={tableKey}
            onNewSource={newSource}
            onQuickOpen={() => setQuickOpen(true)}
          />
        </section>
        <SourceModal
          open={sourceModal.open}
          source={sourceModal.source}
          onClose={() => setSourceModal({ open: false, source: null })}
        />
      </div>
      {quickOpen && (
        <QuickOpen
          onClose={() => setQuickOpen(false)}
          onNewSource={() => {
            setQuickOpen(false);
            newSource();
          }}
        />
      )}
    </>
  );
}
