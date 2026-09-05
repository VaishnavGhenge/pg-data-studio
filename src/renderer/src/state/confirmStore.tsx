// Promise-based confirm dialog, hookified from the old renderer's
// confirmModal(). `confirm(opts)` opens the dialog and resolves true/false
// once the (future) ConfirmDialog component calls `resolve`.

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

export interface ConfirmOpts {
  title: string;
  body?: string;
  okLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmContextValue {
  opts: ConfirmOpts | null; // null = dialog closed
  confirm: (opts: ConfirmOpts) => Promise<boolean>;
  resolve: (ok: boolean) => void;
}

const Ctx = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOpts | null>(null);
  const resolverRef = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOpts): Promise<boolean> => {
    setOpts(o);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const resolve = useCallback((ok: boolean) => {
    resolverRef.current?.(ok);
    resolverRef.current = null;
    setOpts(null);
  }, []);

  return <Ctx.Provider value={{ opts, confirm, resolve }}>{children}</Ctx.Provider>;
}

// Access to open/resolve the dialog (used by the ConfirmDialog component itself).
export function useConfirmDialog(): ConfirmContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useConfirmDialog must be used within ConfirmProvider");
  return ctx;
}

// The call site's view: just `confirm(opts) => Promise<boolean>`.
export function useConfirm(): (opts: ConfirmOpts) => Promise<boolean> {
  return useConfirmDialog().confirm;
}

// Hook version of the old confirmDiscard() shortcut.
export function useConfirmDiscard(): () => Promise<boolean> {
  const confirm = useConfirm();
  return useCallback(
    () =>
      confirm({
        title: "You have unsaved changes",
        body: "Discard them?",
        okLabel: "Discard",
        danger: true,
      }),
    [confirm],
  );
}
