import { useEffect, useRef, useState } from "react";

export function InlineCellEditor({
  value,
  onCommit,
  onCancel,
  onAdvance,
}: {
  value: Cell;
  onCommit: (text: string) => void;
  onCancel: () => void;
  onAdvance: (back: boolean) => void;
}) {
  const [text, setText] = useState(value ?? "");
  const ref = useRef<HTMLInputElement>(null);
  const finished = useRef(false);
  const touched = useRef(false);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  function commit() {
    if (!finished.current) {
      finished.current = true;
      if (!touched.current && value === null) onCancel();
      else onCommit(text);
    }
  }
  return (
    <input
      ref={ref}
      className="cell cell-input"
      aria-label="Edit cell value"
      data-pending-edit={text !== (value ?? "") ? "" : undefined}
      value={text}
      onChange={(e) => {
        touched.current = true;
        setText(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          finished.current = true;
          onCancel();
        }
        if (e.key === "Enter" || e.key === "Tab") {
          e.preventDefault();
          commit();
          if (e.key === "Tab") onAdvance(e.shiftKey);
        }
      }}
    />
  );
}
