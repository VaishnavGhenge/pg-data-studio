import { useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { NavigatorTree } from "./NavigatorTree";
import { SourceContextMenu } from "./SourceContextMenu";
import { useSourceActions } from "../../hooks/useSourceActions";
import { useSourcesState } from "../../state/sourcesStore";
import { PlusIcon } from "../common/icons";

interface SidebarProps {
  sideRef: RefObject<HTMLElement | null>;
  onOpenTable: (schema: string, table: string) => void;
  onNewSource: () => void;
  onEditSource: (id: string) => void;
}

export function Sidebar({ sideRef, onOpenTable, onNewSource, onEditSource }: SidebarProps) {
  // The input shows exactly what was typed (including a trailing space);
  // only the trimmed value is used for matching, same as the old renderer.
  const [filterRaw, setFilterRaw] = useState("");
  const [ctxMenu, setCtxMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [refreshSignal, setRefreshSignal] = useState(0);
  const { connectedId } = useSourcesState();
  const { disconnect, deleteSource, duplicateSource } = useSourceActions();
  const filterInputRef = useRef<HTMLInputElement>(null);
  const treeRegionRef = useRef<HTMLDivElement>(null);

  // Type-to-search: typing anywhere in the table list (not already in the
  // filter box itself) routes the keystroke there instead of doing nothing,
  // matching Finder/VS Code sidebar behavior. Only meaningful once a source
  // is connected — with nothing to search, a keystroke here plays the OS
  // "that shortcut isn't bound to anything" alert sound instead, the same
  // way macOS itself responds to an unassigned key combo.
  function handleTreeKeyDown(e: KeyboardEvent<HTMLDivElement>): void {
    const target = e.target as HTMLElement;
    if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;
    if (e.metaKey || e.ctrlKey || e.altKey || e.key.length !== 1) return;

    e.preventDefault();
    if (!connectedId) {
      window.api.beep();
      return;
    }
    setFilterRaw((prev) => prev + e.key);
    filterInputRef.current?.focus();
  }

  return (
    <aside className="side" ref={sideRef}>
      <div className="side-head">
        <span>Databases</span>
        <div className="side-tools">
          <button
            className="icon-btn"
            title="New data source"
            aria-label="New data source"
            onClick={onNewSource}
          >
            <PlusIcon size={14} />
          </button>
        </div>
      </div>
      <div className="tree-filter">
        <input
          ref={filterInputRef}
          className="tree-filter-input"
          spellCheck={false}
          autoComplete="off"
          placeholder="Filter tables…"
          aria-label="Filter tables"
          value={filterRaw}
          onChange={(e) => setFilterRaw(e.target.value)}
        />
      </div>
      <div
        ref={treeRegionRef}
        className="tree-focus-region"
        tabIndex={-1}
        onMouseDown={() => treeRegionRef.current?.focus()}
        onKeyDown={handleTreeKeyDown}
      >
        <NavigatorTree
          filter={filterRaw.trim()}
          refreshSignal={refreshSignal}
          onOpenTable={onOpenTable}
          onSourceContextMenu={(id, x, y) => setCtxMenu({ id, x, y })}
        />
      </div>
      {ctxMenu && (
        <SourceContextMenu
          sourceId={ctxMenu.id}
          x={ctxMenu.x}
          y={ctxMenu.y}
          onClose={() => setCtxMenu(null)}
          onEdit={onEditSource}
          onDuplicate={duplicateSource}
          onRefresh={(id) => {
            if (connectedId === id) setRefreshSignal((k) => k + 1);
          }}
          onDisconnect={(id) => {
            if (connectedId === id) disconnect();
          }}
          onDelete={deleteSource}
        />
      )}
    </aside>
  );
}
