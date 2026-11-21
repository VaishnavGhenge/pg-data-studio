// Single-slot toast, matching the old renderer's toast(): a new call replaces
// whatever's showing and restarts the auto-dismiss timer rather than queuing
// multiple toasts. Errors stay 8s (Postgres messages are long to read) and
// can be dismissed early.

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

interface ToastState {
  message: string;
  isError: boolean;
  visible: boolean;
}

interface ToastContextValue extends ToastState {
  show: (message: string, isError?: boolean) => void;
  hide: () => void;
}

const Ctx = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState>({ message: "", isError: false, visible: false });
  const timerRef = useRef<number | undefined>(undefined);

  const show = useCallback((message: string, isError = false) => {
    setState({ message, isError, visible: true });
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(
      () => {
        setState((s) => ({ ...s, visible: false }));
      },
      isError ? 8000 : 2200,
    );
  }, []);
  const hide = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    setState((s) => ({ ...s, visible: false }));
  }, []);

  return <Ctx.Provider value={{ ...state, show, hide }}>{children}</Ctx.Provider>;
}

export function useToast(): ToastContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
