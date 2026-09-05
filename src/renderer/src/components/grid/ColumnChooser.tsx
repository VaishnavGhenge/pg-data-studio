import type { Dispatch, SetStateAction } from "react";
import { defaultColumnLayout, type ColumnLayout } from "../../hooks/useColumnLayout";

export function ColumnChooser({
  columns,
  layout,
  setLayout,
  onChange,
  onClose,
}: {
  columns: Column[];
  layout: ColumnLayout;
  setLayout: Dispatch<SetStateAction<ColumnLayout>>;
  onChange: () => void;
  onClose: () => void;
}) {
  const visibleCount = columns.filter((column) => !layout.hidden.includes(column.name)).length;
  return (
    <div className="column-chooser" aria-label="Column visibility and pinning">
      {columns.map((column) => (
        <div key={column.name}>
          <label>
            <input
              type="checkbox"
              checked={!layout.hidden.includes(column.name)}
              disabled={visibleCount === 1 && !layout.hidden.includes(column.name)}
              onChange={(event) => {
                onChange();
                setLayout((previous) => ({
                  ...previous,
                  hidden: event.target.checked
                    ? previous.hidden.filter((name) => name !== column.name)
                    : [...previous.hidden, column.name],
                }));
              }}
            />
            {column.name}
          </label>
          <button
            className="btn ghost"
            aria-pressed={layout.pinned.includes(column.name)}
            onClick={() => {
              onChange();
              setLayout((previous) => ({
                ...previous,
                pinned: previous.pinned.includes(column.name)
                  ? previous.pinned.filter((name) => name !== column.name)
                  : [...previous.pinned, column.name],
              }));
            }}
          >
            {layout.pinned.includes(column.name) ? "Unpin" : "Pin"}
          </button>
        </div>
      ))}
      <button
        className="btn ghost"
        onClick={() => {
          onChange();
          setLayout(defaultColumnLayout());
          onClose();
        }}
      >
        Reset columns
      </button>
    </div>
  );
}
