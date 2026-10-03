import { useState, type Dispatch, type SetStateAction } from "react";
import { Modal } from "../common/Modal";
import { CloseIcon } from "../common/icons";
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
  const [search, setSearch] = useState("");
  const filtered = columns.filter((column) =>
    column.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const visibleCount = columns.filter((column) => !layout.hidden.includes(column.name)).length;
  return (
    <Modal
      open
      onClose={onClose}
      className="columns-dialog"
      labelledBy="columns-dialog-title"
      describedBy="columns-dialog-description"
    >
      <div className="modal-head">
        <h2 id="columns-dialog-title">Columns</h2>
        <button
          className="icon-btn"
          onClick={onClose}
          aria-label="Close columns"
          title="Close columns"
        >
          <CloseIcon size={15} />
        </button>
      </div>
      <p id="columns-dialog-description" className="panel-description">
        Choose visible columns. Pin columns to keep them in view as you scroll.
      </p>
      <input
        className="field column-search"
        type="search"
        autoFocus
        aria-label="Find columns"
        placeholder="Find a column…"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
      />
      <div className="column-list-meta">
        <span aria-live="polite">
          {visibleCount} of {columns.length} visible
        </span>
        <span>{layout.pinned.length} pinned</span>
      </div>
      <div className="column-chooser" aria-label="Column visibility and pinning">
        {filtered.map((column) => (
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
              <span className="column-choice-text">
                <span title={column.name}>{column.name}</span>
                <small>{column.dataType}</small>
              </span>
            </label>
            <button
              className="btn ghost"
              aria-label={`${layout.pinned.includes(column.name) ? "Unpin" : "Pin"} ${column.name}`}
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
        {filtered.length === 0 && <p className="column-empty">No columns match “{search}”.</p>}
      </div>
      <div className="panel-footer">
        <button
          title="Restore visibility, pinning and column widths"
          className="btn ghost"
          onClick={() => {
            onChange();
            setLayout(defaultColumnLayout());
            onClose();
          }}
        >
          Reset columns
        </button>
        <button className="btn" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
