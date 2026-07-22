import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { FILTER_OPS, NO_VALUE_OPS } from "../../lib/filterOps";

interface ColumnFilterPopoverProps {
  column: string;
  anchor: HTMLElement;
  current: { op: FilterOp; value: string } | undefined;
  onApply: (filter: { op: FilterOp; value: string } | null) => Promise<boolean>;
  onClose: () => void;
}

export function ColumnFilterPopover({ column, anchor, current, onApply, onClose }: ColumnFilterPopoverProps) {
  const [op, setOp] = useState<FilterOp>(current?.op ?? "=");
  const [value, setValue] = useState(current?.value ?? "");
  const popRef = useRef<HTMLDivElement>(null);
  const opRef = useRef<HTMLSelectElement>(null);
  const valRef = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const noVal = NO_VALUE_OPS.has(op);

  useLayoutEffect(() => {
    const pop = popRef.current;
    if (!pop) return;
    const r = anchor.getBoundingClientRect();
    const left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8));
    setPos({ left, top: r.bottom + 4 });
  }, [anchor]);

  useEffect(() => {
    if (!pos) return;
    if (noVal) opRef.current?.focus();
    else {
      valRef.current?.focus();
      valRef.current?.select();
    }
    // Only when first positioned, matching the old renderer's one-time focus on open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!pos]);

  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (popRef.current?.contains(t) || t.closest(".funnel")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  async function apply(): Promise<void> {
    const willClear = !noVal && value.trim() === "";
    const shouldClose = await onApply(willClear ? null : { op, value: noVal ? "" : value });
    if (shouldClose) onClose();
  }

  async function clear(): Promise<void> {
    const shouldClose = await onApply(null);
    if (shouldClose) onClose();
  }

  return (
    <div
      ref={popRef}
      className="filter-pop"
      style={{
        position: "fixed",
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        visibility: pos ? "visible" : "hidden",
      }}
    >
      <div className="filter-pop-col">{column}</div>
      <select
        ref={opRef}
        className="filter-pop-op"
        aria-label="Filter operator"
        value={op}
        onChange={(e) => setOp(e.target.value as FilterOp)}
      >
        {FILTER_OPS.map((o) => (
          <option key={o.op} value={o.op}>
            {o.label}
          </option>
        ))}
      </select>
      {!noVal && (
        <input
          ref={valRef}
          className="filter-pop-val"
          spellCheck={false}
          autoComplete="off"
          placeholder="value"
          aria-label="Filter value"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
            else if (e.key === "Escape") onClose();
          }}
        />
      )}
      <div className="filter-pop-btns">
        <button className="btn ghost" onClick={clear}>
          Clear
        </button>
        <button className="btn primary" onClick={apply}>
          Apply
        </button>
      </div>
    </div>
  );
}
