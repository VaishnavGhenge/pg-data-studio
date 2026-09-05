import { useEffect, useState } from "react";
import { SqlEditor } from "./SqlEditor";

interface WhereBarProps {
  appliedWhere: string; // drives the active-border styling + clear-button visibility
  columns: Column[];
  tableName: string;
  onApply: (text: string) => void;
  disabled?: boolean;
}

export function WhereBar({ appliedWhere, columns, tableName, onApply, disabled }: WhereBarProps) {
  const [text, setText] = useState(appliedWhere);
  const pending = text.trim() !== appliedWhere;

  // Re-sync the displayed text only when the *applied* value actually
  // changes (a successful apply/clear) — not on every render — so an
  // in-progress edit here is never clobbered mid-typing.
  useEffect(() => {
    setText(appliedWhere);
  }, [appliedWhere]);

  return (
    <div className="wherebar">
      <span className="wherebar-kw" title="WHERE clause — raw SQL" aria-hidden="true">
        WHERE
      </span>
      <SqlEditor
        className={
          "wherebar-input" + (appliedWhere !== "" ? " active" : "") + (pending ? " pending" : "")
        }
        value={text}
        onChange={setText}
        onEnter={() => {
          if (!disabled) onApply(text.trim());
        }}
        onEscape={() => setText(appliedWhere)}
        placeholder="price > 100 AND code LIKE 'I%'"
        ariaLabel="WHERE clause"
        tableName={tableName}
        columnNames={columns.map((c) => c.name)}
      />
      {/* Apply only earns a slot once the text differs from what ran; Enter
          does the same thing and the button is dead weight until then. */}
      {pending && (
        <button className="btn primary" disabled={disabled} onClick={() => onApply(text.trim())}>
          Apply
        </button>
      )}
      {!pending && appliedWhere !== "" && (
        <button
          className="wherebar-clear"
          title="Clear filter"
          aria-label="Clear filter"
          onClick={() => onApply("")}
          disabled={disabled}
        >
          ×
        </button>
      )}
    </div>
  );
}
