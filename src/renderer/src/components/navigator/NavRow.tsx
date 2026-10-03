// Presentational row shared by every tree level (source/schema/table/column)
// — matches the old renderer's single navRow() string-builder.

import type { MouseEvent, ReactNode } from "react";
import { ChevronIcon, KeyIcon } from "../common/icons";

interface NavRowProps {
  kind: "source" | "schema" | "table" | "column";
  depth: number;
  icon: ReactNode;
  label: string;
  subLabel?: string;
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
  subLabel,
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
      role="treeitem"
      tabIndex={0}
      aria-level={depth + 1}
      aria-expanded={leaf ? undefined : !!open}
      aria-selected={!!active}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        const items = Array.from(
          e.currentTarget
            .closest('[role="tree"]')
            ?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [],
        );
        const index = items.indexOf(e.currentTarget);
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          items[
            Math.max(0, Math.min(items.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)))
          ]?.focus();
        } else if (e.key === "Home" || e.key === "End") {
          e.preventDefault();
          (e.key === "Home" ? items[0] : items.at(-1))?.focus();
        } else if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick?.();
        } else if (e.key === "ArrowRight" && !leaf) {
          e.preventDefault();
          if (!open) (onChevronClick ?? onClick)?.();
          else items[index + 1]?.focus();
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          if (open) (onChevronClick ?? onClick)?.();
          else
            items
              .slice(0, index)
              .reverse()
              .find((item) => Number(item.getAttribute("aria-level")) < depth + 1)
              ?.focus();
        }
      }}
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
      <span className="nav-label-group">
        <span className="nlabel">{renderLabel(label, matchQuery)}</span>
        {subLabel && <small className="nav-sublabel">{subLabel}</small>}
      </span>
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
