import { DatabaseIcon, PlusIcon, ChevronRightIcon } from "../common/icons";
import { useSourcesState } from "../../state/sourcesStore";
import { useSourceActions } from "../../hooks/useSourceActions";
import { useWorkspaceRequests } from "../../state/tableStore";

export function WorkspaceWelcome({
  onNewSource,
  onQuickOpen,
}: {
  onNewSource: () => void;
  onQuickOpen: () => void;
}) {
  const { sources, connectedId, connectingId } = useSourcesState();
  const { connect } = useSourceActions();
  const requests = useWorkspaceRequests();
  const connected = sources.find((source) => source.id === connectedId);
  const command = /Mac/.test(navigator.platform) ? "⌘" : "Ctrl";
  return (
    <div className="workspace-empty">
      <div className="welcome-content">
        <h1>{connected ? "Open a table" : "Connect to PostgreSQL"}</h1>
        <p>
          {connected
            ? "Choose a table in the sidebar or use quick open."
            : "Choose a saved connection or add a new one."}
        </p>
        <div className="welcome-actions">
          <button className="btn primary" onClick={connected ? onQuickOpen : onNewSource}>
            {!connected && <PlusIcon size={14} />}
            {connected ? "Open a table" : "New connection"}
            {connected && <kbd>{command} K</kbd>}
          </button>
          {!connected && sources.length > 0 && (
            <button className="btn ghost" onClick={onQuickOpen}>
              Quick open <kbd>{command} K</kbd>
            </button>
          )}
        </div>
        {!connected && sources.length > 0 && (
          <div className="welcome-connections">
            <span className="eyebrow">Saved connections</span>
            {sources.map((source) => (
              <button
                key={source.id}
                className="connection-card"
                disabled={!!connectingId || requests.busy}
                onClick={() => void connect(source)}
              >
                <span className="connection-card-icon">
                  <DatabaseIcon size={19} />
                </span>
                <span>
                  <strong>{source.name}</strong>
                  <small>
                    {source.database} · {source.host}:{source.port}
                  </small>
                </span>
                {connectingId === source.id ? (
                  <span className="loading-spinner" />
                ) : (
                  <ChevronRightIcon size={16} />
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
