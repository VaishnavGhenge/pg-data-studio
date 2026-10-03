import { Modal } from "../common/Modal";
import type { DirtyEntry } from "../../lib/dirty";
import { describeValue } from "../../lib/gridSelection";
import { CloseIcon } from "../common/icons";

interface SaveConfirmModalProps {
  open: boolean;
  statements: string[];
  changes?: DirtyEntry[];
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SaveConfirmModal({
  open,
  statements,
  changes = [],
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
        <div>
          <h2 id="savePreviewTitle">Review your changes</h2>
        </div>
        <button className="icon-btn" aria-label="Close review" onClick={onCancel} disabled={saving}>
          <CloseIcon />
        </button>
      </div>
      <p className="review-description">
        {changes.length} {changes.length === 1 ? "cell" : "cells"} across {statements.length}{" "}
        {statements.length === 1 ? "row" : "rows"}. These changes will be saved together.
      </p>
      <div className="change-review">
        <table>
          <thead>
            <tr>
              <th>Row / column</th>
              <th>Before</th>
              <th>After</th>
            </tr>
          </thead>
          <tbody>
            {changes.map((change, i) => (
              <tr key={i}>
                <td>
                  <small>
                    {Object.entries(change.pkVals)
                      .map(([key, value]) => key + "=" + value)
                      .join(", ")}
                  </small>
                  <br />
                  {change.col}
                </td>
                <td>
                  <pre>{describeValue(change.old)}</pre>
                </td>
                <td>
                  <pre>{describeValue(change.val)}</pre>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <details>
        <summary>SQL statements</summary>
        <div className="save-preview-list">
          {statements.map((s, i) => (
            <div className="stmt" key={i}>
              {s}
            </div>
          ))}
        </div>
      </details>
      <div className="form-actions">
        <span className="spacer" />
        <button className="btn ghost" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
        <button className="btn primary" onClick={onConfirm} disabled={saving}>
          {saving && <span className="loading-spinner" />}
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
