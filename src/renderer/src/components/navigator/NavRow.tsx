// Presentational row shared by every tree level (source/schema/table/column)
// — matches the old renderer's single navRow() string-builder.

import type { MouseEvent, ReactNode } from "react";
import { ChevronIcon, KeyIcon } from "../common/icons";

interface NavRowProps {
  kind: "source" | "schema" | "table" | "column";
  depth: number;
  icon: ReactNode;
  label: string;
  // The current tree-filter query, if this label should highlight its match
  // (only table rows are actually filtered by it — see NavigatorTree).
  matchQuery?: string;
  open?: boolean;
  active?: boolean;
  leaf?: boolean;
  title?: string;
  typeText?: string;
  pk?: boolean;
  trailing?: ReactNode;
  onClick?: () => void;
  onChevronClick?: () => void;
  onContextMenu?: (e: MouseEvent) => void;
}

// Wraps the substring of `label` that matches `query` (case-insensitive) in
// a <mark> so a search result shows *why* it matched, not just that it did.
function renderLabel(label: string, query: string | undefined): ReactNode {
  if (!query) return label;
  const idx = label.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return label;
  return (
    <>
      {label.slice(0, idx)}
      <mark className="nlabel-match">{label.slice(idx, idx + query.length)}</mark>
      {label.slice(idx + query.length)}
    </>
  );
}

export function NavRow({
  kind,
  depth,
  icon,
  label,
  matchQuery,
  open,
  active,
  leaf,
  title,
  typeText,
  pk,
  trailing,
  onClick,
  onChevronClick,
  onContextMenu,
}: NavRowProps) {
  const pad = 6 + depth * 15;
  return (
    <div
      className={"nrow " + kind + (open ? " open" : "") + (active ? " active" : "")}
      style={{ paddingLeft: pad }}
      title={title}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      {leaf ? (
        <span className="chev leaf" />
      ) : (
        <span
          className="chev"
          onClick={
            onChevronClick
              ? (e) => {
                  e.stopPropagation();
                  onChevronClick();
                }
              : undefined
          }
        >
          <ChevronIcon size={13} />
        </span>
      )}
      <span className="nic">{icon}</span>
      <span className="nlabel">{renderLabel(label, matchQuery)}</span>
      {typeText !== undefined && <span className="ntype">{typeText}</span>}
      {pk && (
        <span className="pkmini" title="primary key">
          <KeyIcon size={11} />
        </span>
      )}
      {trailing}
    </div>
  );
}
