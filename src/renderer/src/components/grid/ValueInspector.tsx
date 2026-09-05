import { useState } from "react";
import { useToast } from "../../state/toastStore";

import { formatJson } from "../../lib/jsonFormat";

export function ValueInspector({
  column,
  value,
  editable,
  onApply,
  onClose,
}: {
  column: Column;
  value: Cell;
  editable: boolean;
  onApply: (value: Cell) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(value ?? "");
  const [isNull, setNull] = useState(value === null);
  const [wrap, setWrap] = useState(true);
  const [error, setError] = useState("");
  const { show: toast } = useToast();
  const isJson = /^jsonb?$/.test(column.dataType);
  function validate(): boolean {
    try {
      if (isJson && !isNull) JSON.parse(text);
      setError("");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }
  return (
    <aside className="value-inspector" aria-label="Value inspector">
      <div className="inspector-head">
        <strong>{column.name}</strong>
        <button className="btn ghost" onClick={onClose} aria-label="Close inspector">
          ×
        </button>
      </div>
      <small>
        {column.dataType} · {editable ? "Editable" : "Read-only"}
      </small>
      <div className="inspector-actions">
        <button
          className="btn ghost"
          onClick={() =>
            navigator.clipboard.writeText(isNull ? "NULL" : text).then(
              () => toast("Copied value"),
              () => toast("Could not copy value", true),
            )
          }
        >
          Copy
        </button>
        {isJson && (
          <>
            <button
              className="btn ghost"
              disabled={isNull}
              onClick={() => {
                if (validate()) setText(formatJson(text));
              }}
            >
              Format JSON
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                if (validate()) toast("Valid JSON");
              }}
            >
              Validate
            </button>
          </>
        )}
        <label>
          <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} /> Wrap
        </label>
      </div>
      <textarea
        aria-label={`${column.name} value`}
        spellCheck={false}
        readOnly={!editable}
        disabled={isNull}
        style={{ whiteSpace: wrap ? "pre-wrap" : "pre" }}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          setError("");
        }}
      />
      {error && (
        <p role="alert" className="inline-error">
          {error}
        </p>
      )}
      <label>
        <input
          type="checkbox"
          checked={isNull}
          disabled={!editable || column.notNull}
          onChange={(e) => setNull(e.target.checked)}
        />{" "}
        NULL{column.notNull ? " (not allowed)" : ""}
      </label>
      {editable && (
        <button
          className="btn primary"
          onClick={() => {
            if (validate()) onApply(isNull ? null : text);
          }}
        >
          Apply to pending changes
        </button>
      )}
      <small>
        {text.length.toLocaleString()} characters · Changes are saved with Save changes.
      </small>
    </aside>
  );
}
