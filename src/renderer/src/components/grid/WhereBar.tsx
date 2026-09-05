import { useEffect, useState } from "react";
import { CodeIcon, CornerDownLeftIcon } from "../common/icons";
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

  // Re-sync the displayed text only when the *applied* value actually
  // changes (a successful apply/clear) — not on every render — so an
  // in-progress edit here is never clobbered mid-typing.
  useEffect(() => {
    setText(appliedWhere);
  }, [appliedWhere]);

  return (
    <div className="wherebar">
      <span className="wherebar-kw" title="WHERE clause — raw SQL" aria-label="WHERE clause">
        <CodeIcon size={13} />
      </span>
      <SqlEditor
        className={"wherebar-input" + (appliedWhere !== "" ? " active" : "")}
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
      <span className="where-state">
        {text.trim() !== appliedWhere ? "Not applied" : appliedWhere ? "Applied" : "WHERE"}
      </span>
      <button
        className="btn ghost"
        disabled={disabled || text.trim() === appliedWhere}
        onClick={() => onApply(text.trim())}
      >
        Apply
      </button>
      {text === "" && (
        <span className="wherebar-hint">
          <kbd className="wherebar-key">
            <CornerDownLeftIcon size={11} />
          </kbd>
          to apply
        </span>
      )}
      {appliedWhere !== "" && (
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
