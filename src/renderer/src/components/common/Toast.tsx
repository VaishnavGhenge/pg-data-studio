import { useToast } from "../../state/toastStore";

export function Toast() {
  const { message, isError, visible } = useToast();
  return (
    <div className={"toast" + (isError ? " err" : "") + (visible ? " show" : "")}>{message}</div>
  );
}
