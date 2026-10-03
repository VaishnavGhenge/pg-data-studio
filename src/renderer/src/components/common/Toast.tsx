import { useToast } from "../../state/toastStore";
import { AlertCircleIcon, CheckCircleIcon } from "./icons";

export function Toast() {
  const { message, isError, visible } = useToast();
  return (
    <div
      className={"toast" + (isError ? " err" : "") + (visible ? " show" : "")}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {isError ? <AlertCircleIcon size={14} /> : <CheckCircleIcon size={14} />}
      <span>{message}</span>
    </div>
  );
}
