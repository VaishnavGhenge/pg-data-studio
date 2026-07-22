import { ContextMenu } from "../common/ContextMenu";

interface CellContextMenuProps {
  x: number;
  y: number;
  editable: boolean;
  onClose: () => void;
  onEditInEditor: () => void;
  onSetNull: () => void;
}

export function CellContextMenu({
  x,
  y,
  editable,
  onClose,
  onEditInEditor,
  onSetNull,
}: CellContextMenuProps) {
  return (
    <ContextMenu x={x} y={y} onClose={onClose}>
      <button
        className="ctx-item"
        onClick={() => {
          onClose();
          onEditInEditor();
        }}
      >
        Edit in editor…
      </button>
      <button
        className="ctx-item"
        disabled={!editable}
        onClick={() => {
          onClose();
          onSetNull();
        }}
      >
        Set NULL
      </button>
    </ContextMenu>
  );
}
