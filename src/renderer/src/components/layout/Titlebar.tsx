import { useSourcesState } from "../../state/sourcesStore";
import type { CSSProperties } from "react";
import { DisplaySettings } from "./DisplaySettings";
import { useSourceAppearance } from "../../lib/sourceAppearance";
import { DatabaseIcon, SearchIcon } from "../common/icons";

export function Titlebar({ onQuickOpen }: { onQuickOpen: () => void }) {
  const { dbMeta, connectedId, connectingId } = useSourcesState();
  const appearance = useSourceAppearance(connectingId ? null : connectedId);
  const marked = !!connectedId && !connectingId && !!appearance.color;
  return (
    <header
      className={"titlebar" + (marked ? " marked" : "")}
      style={
        {
          paddingLeft: /Mac/.test(navigator.platform) ? 78 : 20,
          "--conn-color": appearance.color || undefined,
        } as CSSProperties
      }
    >
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
        {connectedId && !connectingId && appearance.environment && (
          <span className={"environment-badge" + (marked ? " marked" : "")}>
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
            {connectedId && <span className="status-dot online" />}
            {dbMeta?.database ?? "No connection"}
          </span>
        )}
      </div>
      <DisplaySettings />
    </header>
  );
}
