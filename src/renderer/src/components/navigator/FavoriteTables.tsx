import { useState } from "react";
import { ChevronIcon, TableIcon } from "../common/icons";
import { FavoriteButton } from "../common/FavoriteButton";
import { readPreference, writePreference, tableId } from "../../lib/preferences";

type Table = { schema: string; name: string };

export function FavoriteTables({
  connectionId,
  favorites,
  current,
  query,
  onOpen,
  onToggleFavorite,
}: {
  connectionId: string;
  favorites: Table[];
  current: Table | null;
  query: string;
  onOpen: (schema: string, name: string) => void;
  onToggleFavorite: (schema: string, name: string) => void;
}) {
  const preference = `sidebar-section:${connectionId}:favorites`;
  const [expanded, setExpanded] = useState(() => readPreference(preference, true));
  const search = query.trim().toLowerCase();
  const matches = favorites.filter((table) =>
    `${table.schema}.${table.name}`.toLowerCase().includes(search),
  );
  if (!favorites.length || (search && !matches.length)) return null;
  return (
    <section className="table-shortcuts" aria-label="Favorites">
      <button
        className="shortcut-heading"
        aria-expanded={expanded}
        aria-controls="shortcut-list-favorites"
        onClick={() => {
          setExpanded(!expanded);
          writePreference(preference, !expanded);
        }}
      >
        <span className={"shortcut-chevron" + (expanded ? " expanded" : "")}>
          <ChevronIcon size={12} />
        </span>
        Favorites
        <span className="shortcut-count">{matches.length}</span>
      </button>
      <ul id="shortcut-list-favorites" className="shortcut-list" hidden={!expanded}>
        {matches.map((table) => {
          const active = current?.schema === table.schema && current.name === table.name;
          return (
            <li
              className={"shortcut-row" + (active ? " active" : "")}
              key={tableId(table.schema, table.name)}
            >
              <button
                className="shortcut-open"
                title={`${table.schema}.${table.name}`}
                aria-label={`Open ${table.schema}.${table.name}`}
                aria-current={active ? "page" : undefined}
                onClick={() => onOpen(table.schema, table.name)}
              >
                <TableIcon size={14} />
                <span className="shortcut-name">{table.name}</span>
                <span className="shortcut-schema">{table.schema}</span>
              </button>
              <FavoriteButton
                schema={table.schema}
                name={table.name}
                favorite
                onToggle={() => onToggleFavorite(table.schema, table.name)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
