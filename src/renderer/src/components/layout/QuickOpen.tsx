import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "../common/Modal";
import { DatabaseIcon, SearchIcon, TableIcon, PlusIcon } from "../common/icons";
import { useSourcesState } from "../../state/sourcesStore";
import { useSourceActions } from "../../hooks/useSourceActions";
import { useTableActions } from "../../hooks/useTableActions";
import { useWorkspaceRequests } from "../../state/tableStore";

type Result = { kind: "table"; table: TableInfo } | { kind: "source"; source: Source };

export function QuickOpen({
  onClose,
  onNewSource,
}: {
  onClose: () => void;
  onNewSource: () => void;
}) {
  const { connectedId, connectingId, sources } = useSourcesState();
  const { connect } = useSourceActions();
  const { openTable } = useTableActions();
  const requests = useWorkspaceRequests();
  const [query, setQuery] = useState("");
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [loading, setLoading] = useState(!!connectedId);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const busy = requests.busy || !!connectingId;
  useEffect(() => {
    let cancelled = false;
    setTables([]);
    setError("");
    setLoading(!!connectedId);
    if (connectedId)
      void window.api
        .listTables()
        .then((result) => {
          if (cancelled) return;
          if (result.ok) setTables(result.data);
          else setError(result.error);
          setLoading(false);
        })
        .catch((error) => {
          if (cancelled) return;
          setError(error instanceof Error ? error.message : String(error));
          setLoading(false);
        });
    return () => {
      cancelled = true;
    };
  }, [connectedId, retry]);
  const matches = useMemo(() => {
    const search = query.trim().toLowerCase();
    const results: Result[] = [
      ...tables
        .filter((table) => `${table.schema}.${table.name}`.toLowerCase().includes(search))
        .map((table): Result => ({ kind: "table", table })),
      ...sources
        .filter(
          (source) =>
            source.id !== connectedId &&
            `${source.name} ${source.database} ${source.host}`.toLowerCase().includes(search),
        )
        .map((source): Result => ({ kind: "source", source })),
    ];
    return results;
  }, [query, tables, sources, connectedId]);
  const results = matches.slice(0, 80);
  const activeIndex = Math.min(active, Math.max(0, results.length - 1));
  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, query, results.length]);
  function choose(result: Result | undefined) {
    if (!result || busy) return;
    onClose();
    if (result.kind === "table") void openTable(result.table.schema, result.table.name);
    else void connect(result.source);
  }
  return (
    <Modal open onClose={onClose} className="quick-open" labelledBy="quick-open-title">
      <h2 id="quick-open-title" className="sr-only">
        Quick open
      </h2>
      <div className="quick-open-search">
        <SearchIcon size={20} />
        <input
          autoFocus
          value={query}
          placeholder="Find a table or connection…"
          role="combobox"
          aria-label="Find a table or connection"
          aria-expanded="true"
          aria-controls="quick-open-results"
          aria-activedescendant={results.length ? `quick-result-${activeIndex}` : undefined}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setActive(
                Math.max(
                  0,
                  Math.min(results.length - 1, activeIndex + (e.key === "ArrowDown" ? 1 : -1)),
                ),
              );
            }
            if (e.key === "Enter") {
              e.preventDefault();
              choose(results[activeIndex]);
            }
          }}
        />
        <button className="quick-open-close" onClick={onClose} aria-label="Close quick open">
          <kbd>Esc</kbd>
        </button>
      </div>
      <div
        className="quick-open-list"
        ref={listRef}
        id="quick-open-results"
        role="listbox"
        aria-label="Tables and connections"
        aria-busy={loading}
      >
        {loading && (
          <div className="quick-open-empty" role="status">
            <span className="loading-spinner" />
            Loading tables…
          </div>
        )}
        {error && (
          <div className="quick-open-empty" role="alert">
            {error}
            <button className="btn ghost" onClick={() => setRetry((value) => value + 1)}>
              Retry
            </button>
          </div>
        )}
        {!loading && !error && results.length === 0 && (
          <div className="quick-open-empty">
            {query ? "No matches. Try a different name." : "Add a connection to start browsing."}
          </div>
        )}
        {results.map((result, index) => (
          <button
            key={
              result.kind === "table"
                ? JSON.stringify([result.table.schema, result.table.name])
                : result.source.id
            }
            id={`quick-result-${index}`}
            role="option"
            tabIndex={-1}
            aria-selected={index === activeIndex}
            className="quick-open-result"
            disabled={busy}
            onMouseMove={() => setActive(index)}
            onClick={() => choose(result)}
          >
            <span className="result-symbol">
              {result.kind === "table" ? <TableIcon size={17} /> : <DatabaseIcon size={17} />}
            </span>
            <span className="result-label">
              <strong>{result.kind === "table" ? result.table.name : result.source.name}</strong>
              <small>
                {result.kind === "table"
                  ? result.table.schema
                  : `${result.source.database} · ${result.source.host}`}
              </small>
            </span>
            <span className="result-type">{result.kind === "table" ? "Table" : "Connect"}</span>
          </button>
        ))}
      </div>
      <div className="quick-open-footer">
        <button className="btn ghost" onClick={onNewSource}>
          <PlusIcon />
          New connection
        </button>
        <span>
          {matches.length > 80 ? (
            "First 80 matches · keep typing"
          ) : (
            <>
              <kbd>↑</kbd>
              <kbd>↓</kbd> navigate <kbd>↵</kbd> open
            </>
          )}
        </span>
      </div>
    </Modal>
  );
}
