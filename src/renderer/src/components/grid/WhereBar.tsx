import { useEffect, useState } from "react";

interface WhereBarProps {
  appliedWhere: string; // drives the active-border styling + clear-button visibility
  onApply: (text: string) => void;
}

export function WhereBar({ appliedWhere, onApply }: WhereBarProps) {
  const [text, setText] = useState(appliedWhere);

  // Re-sync the displayed text only when the *applied* value actually
  // changes (a successful apply/clear) — not on every render — so an
  // in-progress edit here is never clobbered mid-typing.
  useEffect(() => {
    setText(appliedWhere);
  }, [appliedWhere]);

  return (
    <div className="wherebar">
      <span className="wherebar-kw">WHERE</span>
      <input
        className={"wherebar-input" + (appliedWhere !== "" ? " active" : "")}
        spellCheck={false}
        autoComplete="off"
        placeholder="price &gt; 100 AND code LIKE 'I%'   —   raw SQL, press Enter to apply"
        aria-label="WHERE clause"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onApply(text.trim());
          else if (e.key === "Escape") onApply("");
        }}
      />
      {appliedWhere !== "" && (
        <button
          className="wherebar-clear"
          title="Clear filter"
          aria-label="Clear filter"
          onClick={() => onApply("")}
        >
          ×
        </button>
      )}
    </div>
  );
}
