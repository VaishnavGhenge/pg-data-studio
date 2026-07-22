import { Modal } from "../common/Modal";

interface SaveConfirmModalProps {
  open: boolean;
  statements: string[];
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SaveConfirmModal({
  open,
  statements,
  saving,
  onConfirm,
  onCancel,
}: SaveConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={saving ? () => {} : onCancel}
      className="save-preview"
      labelledBy="savePreviewTitle"
    >
      <div className="modal-head">
        <h2 id="savePreviewTitle">
          Save {statements.length} {statements.length === 1 ? "change" : "changes"}?
        </h2>
      </div>
      <div className="save-preview-list">
        {statements.map((s, i) => (
          <div className="stmt" key={i}>
            {s}
          </div>
        ))}
      </div>
      <div className="form-actions">
        <span className="spacer" />
        <button className="btn ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button className="btn primary" onClick={onConfirm} disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
