import { useEffect, useMemo, useRef, useState } from "react";
import { CodeIcon } from "../common/icons";

interface WhereBarProps {
  appliedWhere: string; // drives the active-border styling + clear-button visibility
  columns: Column[];
  onApply: (text: string) => void;
}

// The identifier-like run of characters touching the cursor — the "word"
// being typed, used both to decide what to suggest and what to replace when
// a suggestion is accepted.
function findTokenRange(value: string, cursor: number): { start: number; end: number } {
  let start = cursor;
  while (start > 0 && /[A-Za-z0-9_]/.test(value[start - 1])) start--;
  let end = cursor;
  while (end < value.length && /[A-Za-z0-9_]/.test(value[end])) end++;
  return { start, end };
}

export function WhereBar({ appliedWhere, columns, onApply }: WhereBarProps) {
  const [text, setText] = useState(appliedWhere);
  const [cursor, setCursor] = useState(0);
  const [suggestIndex, setSuggestIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Re-sync the displayed text only when the *applied* value actually
  // changes (a successful apply/clear) — not on every render — so an
  // in-progress edit here is never clobbered mid-typing.
  useEffect(() => {
    setText(appliedWhere);
  }, [appliedWhere]);

  const { start: tokenStart, end: tokenEnd } = findTokenRange(text, cursor);
  const prefix = text.slice(tokenStart, cursor);

  const suggestions = useMemo(() => {
    if (!prefix) return [];
    const lower = prefix.toLowerCase();
    return columns
      .map((c) => c.name)
      .filter((name) => name.toLowerCase().startsWith(lower) && name.toLowerCase() !== lower)
      .slice(0, 8);
  }, [columns, prefix]);

  // Reset the highlighted item and un-dismiss whenever what's being typed
  // changes, so dismissing one suggestion list with Escape doesn't
  // permanently suppress suggestions for the rest of the session.
  useEffect(() => {
    setSuggestIndex(0);
    setDismissed(false);
  }, [prefix]);

  const suggestOpen = suggestions.length > 0 && !dismissed;

  function syncCursor(el: HTMLInputElement): void {
    setCursor(el.selectionStart ?? el.value.length);
  }

  function acceptSuggestion(name: string): void {
    const next = text.slice(0, tokenStart) + name + text.slice(tokenEnd);
    const nextCursor = tokenStart + name.length;
    setText(next);
    setCursor(nextCursor);
    requestAnimationFrame(() => {
      inputRef.current?.setSelectionRange(nextCursor, nextCursor);
      inputRef.current?.focus();
    });
  }

  return (
    <div className="wherebar">
      <span className="wherebar-kw" title="WHERE clause — raw SQL" aria-label="WHERE clause">
        <CodeIcon size={13} />
      </span>
      <div className="wherebar-input-wrap">
        <input
          ref={inputRef}
          className={"wherebar-input" + (appliedWhere !== "" ? " active" : "")}
          spellCheck={false}
          autoComplete="off"
          placeholder="price > 100 AND code LIKE 'I%'"
          aria-label="WHERE clause"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            syncCursor(e.target);
          }}
          onKeyUp={(e) => syncCursor(e.currentTarget)}
          onClick={(e) => syncCursor(e.currentTarget)}
          onKeyDown={(e) => {
            if (suggestOpen) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setSuggestIndex((i) => (i + 1) % suggestions.length);
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setSuggestIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
                return;
              }
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                acceptSuggestion(suggestions[suggestIndex]);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setDismissed(true);
                return;
              }
            }
            if (e.key === "Enter") onApply(text.trim());
            else if (e.key === "Escape") onApply("");
          }}
        />
        {suggestOpen && (
          <div className="wherebar-suggest">
            {suggestions.map((name, i) => (
              <div
                key={name}
                className={"wherebar-suggest-item" + (i === suggestIndex ? " active" : "")}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus in the input, don't blur it
                  acceptSuggestion(name);
                }}
                onMouseEnter={() => setSuggestIndex(i)}
              >
                {name}
              </div>
            ))}
          </div>
        )}
      </div>
      {text === "" && <span className="wherebar-hint">↵ to apply</span>}
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
