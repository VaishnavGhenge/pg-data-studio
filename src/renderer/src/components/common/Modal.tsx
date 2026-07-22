// Generic modal shell: backdrop + panel, closes on Escape or a backdrop
// click. Conditionally rendered (not `hidden`-toggled) on purpose — this repo
// already hit a bug once where an element's own `display` rule fought the
// `hidden` attribute; not rendering the node at all sidesteps that class of
// bug entirely.

import { useEffect, type ReactNode } from "react";

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
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, closeOnEscape, onClose]);

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
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
      >
        {children}
      </div>
    </div>
  );
}
