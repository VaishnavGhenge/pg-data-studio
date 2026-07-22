import { useEffect } from "react";
import { useConfirmDialog } from "../../state/confirmStore";
import { Modal } from "./Modal";

export function ConfirmDialog() {
  const { opts, resolve } = useConfirmDialog();

  // Escape (cancel) and backdrop-click are handled by Modal via onClose;
  // Enter-to-confirm is specific to this dialog.
  useEffect(() => {
    if (!opts) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") resolve(true);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [opts, resolve]);

  return (
    <Modal
      open={!!opts}
      onClose={() => resolve(false)}
      role="alertdialog"
      className={"confirm" + (opts?.danger ? " danger" : "")}
      labelledBy="confirmTitle"
      describedBy="confirmBody"
    >
      <h2 className="confirm-title" id="confirmTitle">
        {opts?.title}
      </h2>
      <p className="confirm-body" id="confirmBody">
        {opts?.body ?? ""}
      </p>
      <div className="confirm-actions">
        <button className="btn ghost" onClick={() => resolve(false)}>
          {opts?.cancelLabel ?? "Cancel"}
        </button>
        <button className="btn primary" autoFocus onClick={() => resolve(true)}>
          {opts?.okLabel ?? "OK"}
        </button>
      </div>
    </Modal>
  );
}
