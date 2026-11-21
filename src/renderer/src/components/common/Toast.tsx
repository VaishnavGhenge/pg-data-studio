import { useToast } from "../../state/toastStore";
import { AlertCircleIcon, CheckCircleIcon, CloseIcon } from "./icons";

export function Toast() {
  const { message, isError, visible, hide } = useToast();
  return (
    <div
      className={"toast" + (isError ? " err" : "") + (visible ? " show" : "")}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {isError ? <AlertCircleIcon size={14} /> : <CheckCircleIcon size={14} />}
      <span>{message}</span>
      {isError && visible && (
        <button className="icon-btn toast-close" aria-label="Dismiss" onClick={hide}>
          <CloseIcon size={13} />
        </button>
      )}
    </div>
  );
}
