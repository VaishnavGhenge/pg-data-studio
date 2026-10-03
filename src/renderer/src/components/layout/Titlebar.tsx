import { useSourcesState } from "../../state/sourcesStore";
import { useEffect, useState } from "react";
import { DisplaySettings, type SourceAppearance } from "./DisplaySettings";
import { readPreference } from "../../lib/preferences";
import { DatabaseIcon, SearchIcon } from "../common/icons";

export function Titlebar({ onQuickOpen }: { onQuickOpen: () => void }) {
  const { dbMeta, connectedId, connectingId } = useSourcesState();
  const [appearance, setAppearance] = useState<SourceAppearance>({
    color: "#708d75",
    environment: "",
  });
  useEffect(() => {
    const update = () =>
      setAppearance(
        readPreference("source-appearance:" + connectedId, { color: "#708d75", environment: "" }),
      );
    update();
    window.addEventListener("source-appearance-change", update);
    return () => window.removeEventListener("source-appearance-change", update);
  }, [connectedId]);
  return (
    <header className="titlebar" style={{ paddingLeft: /Mac/.test(navigator.platform) ? 78 : 20 }}>
      <div className="workspace-brand">
        <span className="brand-symbol">
          <DatabaseIcon size={18} />
        </span>
        <span className="titlebar-name">PG Studio</span>
      </div>
      <button
        className="quick-open-trigger no-drag"
        onClick={onQuickOpen}
        aria-label="Quick open"
        aria-keyshortcuts="Control+k Meta+k"
      >
        <SearchIcon size={14} />
        <span>Find a table or connection</span>
        <kbd>{/Mac/.test(navigator.platform) ? "⌘" : "Ctrl"} K</kbd>
      </button>
      <div className="connection-presence">
        {connectedId && !connectingId && (
          <span className="environment-badge" title="Connected">
            <span className="status-dot" style={{ background: appearance.color }} />
            {appearance.environment}
          </span>
        )}
        {connectingId ? (
          <span className="connection-progress" role="status">
            <span className="loading-spinner" />
            Connecting…
          </span>
        ) : (
          <span
            className="titlebar-conn"
            title={dbMeta ? `${dbMeta.database} · ${dbMeta.host}` : undefined}
          >
            {dbMeta?.database ?? "No connection"}
          </span>
        )}
      </div>
      <DisplaySettings />
    </header>
  );
}
