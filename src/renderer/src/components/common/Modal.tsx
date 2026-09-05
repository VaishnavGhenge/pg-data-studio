// Generic modal shell: backdrop + panel, closes on Escape or a backdrop
// click. Conditionally rendered (not `hidden`-toggled) on purpose — this repo
// already hit a bug once where an element's own `display` rule fought the
// `hidden` attribute; not rendering the node at all sidesteps that class of
// bug entirely.

import { useEffect, useRef, type ReactNode } from "react";

interface ModalProps {
  open: boolean;
  onClose: () => void;
  className?: string;
  role?: "dialog" | "alertdialog";
  labelledBy?: string;
  describedBy?: string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  children: ReactNode;
}

export function Modal({
  open,
  onClose,
  className,
  role = "dialog",
  labelledBy,
  describedBy,
  closeOnBackdrop = true,
  closeOnEscape = true,
  children,
}: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const wasOpen = useRef(false);
  const opener = useRef<HTMLElement | null>(null);
  if (open && !wasOpen.current) opener.current = document.activeElement as HTMLElement;
  wasOpen.current = open;
  useEffect(() => {
    if (!open) return;
    const dialog = ref.current!;
    const focusable = () =>
      Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ),
      ).filter((el) => el.getClientRects().length);
    if (!dialog.contains(document.activeElement)) (focusable()[0] ?? dialog).focus();
    const topmost = () =>
      Array.from(document.querySelectorAll('[aria-modal="true"]')).at(-1) === dialog;
    const onKey = (e: KeyboardEvent) => {
      if (!topmost()) return;
      if (e.key === "Escape" && closeOnEscape) {
        e.preventDefault();
        e.stopImmediatePropagation();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const items = focusable();
        const first = items[0],
          last = items.at(-1);
        if (!first) {
          e.preventDefault();
          dialog.focus();
        } else if (
          e.shiftKey &&
          (document.activeElement === first || document.activeElement === dialog)
        ) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    const onFocus = (e: FocusEvent) => {
      if (topmost() && !dialog.contains(e.target as Node)) (focusable()[0] ?? dialog).focus();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("focusin", onFocus);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("focusin", onFocus);
      if (opener.current?.isConnected) opener.current.focus();
    };
  }, [open, closeOnEscape]);

  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={className ? "modal " + className : "modal"}
        role={role}
        ref={ref}
        tabIndex={-1}
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
      >
        {children}
      </div>
    </div>
  );
}
