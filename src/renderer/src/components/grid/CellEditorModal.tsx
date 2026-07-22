import { useState } from "react";
import { Modal } from "../common/Modal";
import { PencilIcon, CloseIcon } from "../common/icons";

interface CellEditorModalProps {
  open: boolean;
  col: string;
  editable: boolean;
  initialValue: Cell;
  onClose: () => void;
  onSave: (val: Cell) => void;
}

export function CellEditorModal({
  open,
  col,
  editable,
  initialValue,
  onClose,
  onSave,
}: CellEditorModalProps) {
  return (
    <Modal open={open} onClose={onClose} className="cell-editor" labelledBy="cellModalTitle">
      <CellEditorForm
        col={col}
        editable={editable}
        initialValue={initialValue}
        onClose={onClose}
        onSave={onSave}
      />
    </Modal>
  );
}

function CellEditorForm({
  col,
  editable,
  initialValue,
  onClose,
  onSave,
}: {
  col: string;
  editable: boolean;
  initialValue: Cell;
  onClose: () => void;
  onSave: (val: Cell) => void;
}) {
  const [text, setText] = useState(initialValue === null ? "" : String(initialValue));
  const [isNull, setIsNull] = useState(initialValue === null);

  function handleSave() {
    if (!editable) return onClose();
    onSave(isNull ? null : text);
    onClose();
  }

  return (
    <>
      <div className="modal-head">
        <PencilIcon size={18} />
        <h2 id="cellModalTitle">{(editable ? "Edit " : "View ") + col}</h2>
        <button className="icon-btn" title="Close" aria-label="Close" onClick={onClose}>
          <CloseIcon size={15} />
        </button>
      </div>
      <textarea
        className="cell-editor-area"
        spellCheck={false}
        autoComplete="off"
        readOnly={!editable}
        disabled={isNull}
        value={text}
        onChange={(e) => setText(e.target.value)}
        autoFocus={editable}
      />
      <div className="cell-editor-foot">
        <label className="checkbox-row">
          <input
            type="checkbox"
            disabled={!editable}
            checked={isNull}
            onChange={(e) => setIsNull(e.target.checked)}
          />{" "}
          <span>NULL</span>
        </label>
        <span className="spacer" />
        <button className="btn ghost" onClick={onClose}>
          Cancel
        </button>
        {editable && (
          <button className="btn primary" onClick={handleSave}>
            Save
          </button>
        )}
      </div>
    </>
  );
}
