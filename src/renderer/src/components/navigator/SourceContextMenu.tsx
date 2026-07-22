import { useSourcesState } from "../../state/sourcesStore";
import { ContextMenu } from "../common/ContextMenu";

interface SourceContextMenuProps {
  sourceId: string;
  x: number;
  y: number;
  onClose: () => void;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onRefresh: (id: string) => void;
  onDisconnect: (id: string) => void;
  onDelete: (id: string) => void;
}

export function SourceContextMenu({
  sourceId,
  x,
  y,
  onClose,
  onEdit,
  onDuplicate,
  onRefresh,
  onDisconnect,
  onDelete,
}: SourceContextMenuProps) {
  const { connectedId } = useSourcesState();
  // Refresh/Disconnect only apply to the currently-connected source.
  const offline = connectedId !== sourceId;

  function act(fn: (id: string) => void) {
    onClose();
    fn(sourceId);
  }

  return (
    <ContextMenu x={x} y={y} onClose={onClose}>
      <button className="ctx-item" onClick={() => act(onEdit)}>
        Edit…
      </button>
      <button className="ctx-item" onClick={() => act(onDuplicate)}>
        Duplicate
      </button>
      <div className="ctx-sep" />
      <button className="ctx-item" disabled={offline} onClick={() => act(onRefresh)}>
        Refresh
      </button>
      <button className="ctx-item" disabled={offline} onClick={() => act(onDisconnect)}>
        Disconnect
      </button>
      <div className="ctx-sep" />
      <button className="ctx-item danger" onClick={() => act(onDelete)}>
        Delete
      </button>
    </ContextMenu>
  );
}
