// A CodeMirror 6-based single-line SQL input: real syntax highlighting and
// schema-aware completion (columns + SQL keywords), instead of a plain
// <input> or a hand-rolled contenteditable highlighter — the latter is
// exactly the kind of thing prone to cursor/selection bugs (see the cell
// editor's history in this app), so a small proven editor library is the
// safer choice here.

import { useEffect, useLayoutEffect, useRef } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder as placeholderExt } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { sql, PostgreSQL, type SQLNamespace } from "@codemirror/lang-sql";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
  completionStatus,
} from "@codemirror/autocomplete";

// Colors pull from the app's own CSS custom properties so this matches
// whichever theme (light/dark) is active, instead of hardcoding a palette.
const highlightStyle = HighlightStyle.define([
  { tag: tags.keyword, color: "var(--accent)", fontWeight: "600" },
  { tag: tags.operator, color: "var(--pk)" },
  { tag: [tags.string, tags.special(tags.string)], color: "var(--good)" },
  { tag: tags.number, color: "var(--dirty)" },
  { tag: tags.comment, color: "var(--text-faint)", fontStyle: "italic" },
  { tag: [tags.paren, tags.squareBracket, tags.brace], color: "var(--text-faint)" },
  { tag: [tags.name, tags.propertyName], color: "var(--text)" },
  { tag: tags.invalid, color: "var(--danger)" },
]);

const editorTheme = EditorView.theme({
  "&": { fontSize: "12px", fontFamily: "var(--mono)", backgroundColor: "transparent", color: "var(--text)" },
  ".cm-content": { padding: "0", caretColor: "var(--text)" },
  ".cm-line": { padding: "0" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": { fontFamily: "inherit", overflow: "hidden" },
  ".cm-placeholder": { color: "var(--text-faint)" },
  ".cm-tooltip.cm-tooltip-autocomplete": {
    background: "var(--panel)", border: "1px solid var(--border-strong)", borderRadius: "8px",
    boxShadow: "var(--shadow)", overflow: "hidden",
  },
  ".cm-tooltip-autocomplete ul": { fontFamily: "var(--mono)", fontSize: "12px", padding: "4px", maxHeight: "220px" },
  ".cm-tooltip-autocomplete ul li": { padding: "5px 9px", borderRadius: "5px", color: "var(--text-dim)" },
  ".cm-tooltip-autocomplete ul li[aria-selected]": { background: "var(--sel)", color: "var(--text)" },
  ".cm-completionIcon": { display: "none" },
});

interface SqlEditorProps {
  value: string;
  onChange: (text: string) => void;
  onEnter: () => void;
  onEscape: () => void;
  placeholder: string;
  ariaLabel: string;
  className?: string;
  tableName: string;
  columnNames: string[];
}

export function SqlEditor({
  value,
  onChange,
  onEnter,
  onEscape,
  placeholder,
  ariaLabel,
  className,
  tableName,
  columnNames,
}: SqlEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // The sql() extension (schema/completions) is wrapped in a Compartment so
  // it can be reconfigured after the columns arrive. OPEN_TABLE resets
  // TableContext.columns to [] immediately and the real column list only
  // shows up once the (async) query resolves — after this component has
  // already mounted — so schema completion has to be able to update itself
  // post-mount, not just capture whatever columnNames was at construction
  // time (which was reliably empty).
  const sqlCompartmentRef = useRef(new Compartment());
  const lastSchemaKeyRef = useRef("");

  // Callbacks/schema are read through refs inside the (mount-once) editor
  // config so the EditorView itself never needs to be rebuilt when they
  // change — rebuilding on every render would drop cursor position/undo
  // history for no reason.
  const onChangeRef = useRef(onChange);
  const onEnterRef = useRef(onEnter);
  const onEscapeRef = useRef(onEscape);
  onChangeRef.current = onChange;
  onEnterRef.current = onEnter;
  onEscapeRef.current = onEscape;

  useLayoutEffect(() => {
    const schema: SQLNamespace = { [tableName]: columnNames };
    lastSchemaKeyRef.current = tableName + "|" + columnNames.join(",");

    const view = new EditorView({
      parent: containerRef.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          sqlCompartmentRef.current.of(sql({ dialect: PostgreSQL, schema, defaultTable: tableName })),
          syntaxHighlighting(highlightStyle),
          autocompletion(),
          closeBrackets(),
          editorTheme,
          placeholderExt(placeholder),
          EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
          // A WHERE clause is one line: Enter applies it (or, if the
          // completion popup is open, accepts the selected completion
          // instead — same for Escape closing the popup vs. clearing the
          // bar). Returning false defers to the next binding in the list
          // (completionKeymap's own Enter/Escape), which is what makes that
          // layering work.
          keymap.of([
            {
              key: "Enter",
              run: (v) => {
                if (completionStatus(v.state) === "active") return false;
                onEnterRef.current();
                return true;
              },
            },
            {
              key: "Escape",
              run: (v) => {
                if (completionStatus(v.state) !== null) return false;
                onEscapeRef.current();
                return true;
              },
            },
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...defaultKeymap,
            ...historyKeymap,
          ]),
          // Defense in depth: Enter is already fully intercepted above, but
          // strip newlines from anything else that could introduce one
          // (e.g. a multi-line paste) rather than letting the single-line
          // WHERE bar grow a second line.
          EditorState.transactionFilter.of((tr) => {
            if (!tr.docChanged || !/\n/.test(tr.newDoc.toString())) return tr;
            const flattened = tr.newDoc.toString().replace(/\n+/g, " ");
            return [tr, { changes: { from: 0, to: tr.newDoc.length, insert: flattened }, sequential: true }];
          }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString());
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Mount once; the schema/table are effectively fixed for this bar's
    // lifetime (TableView remounts WhereBar's parent tree on table switch).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value changes (e.g. resetting to the applied WHERE after
  // a successful apply/clear) without fighting in-progress typing — only
  // dispatch when the editor's own doc actually differs already.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
    }
  }, [value]);

  // Reconfigure schema completion once the real columns show up (see the
  // comment on sqlCompartmentRef above). Guarded by a joined-string key
  // instead of the columnNames array reference, since callers typically
  // pass a fresh `columns.map(c => c.name)` array every render.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const key = tableName + "|" + columnNames.join(",");
    if (key === lastSchemaKeyRef.current) return;
    lastSchemaKeyRef.current = key;
    const schema: SQLNamespace = { [tableName]: columnNames };
    view.dispatch({
      effects: sqlCompartmentRef.current.reconfigure(
        sql({ dialect: PostgreSQL, schema, defaultTable: tableName })
      ),
    });
  }, [tableName, columnNames]);

  return <div ref={containerRef} className={className} />;
}
