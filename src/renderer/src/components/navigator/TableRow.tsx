import type { ReactNode } from "react";
import { NavRow } from "./NavRow";
import { TableIcon } from "../common/icons";
import { fmtCount } from "../../lib/format";

interface TableRowProps {
  schema: string;
  table: TableInfo;
  open: boolean;
  active: boolean;
  matchQuery: string;
  onOpenTable: () => void;
  onToggleColumns: () => void;
  children?: ReactNode;
}

export function TableRow({
  schema,
  table,
  open,
  active,
  matchQuery,
  onOpenTable,
  onToggleColumns,
  children,
}: TableRowProps) {
  return (
    <>
      <NavRow
        kind="table"
        depth={2}
        icon={<TableIcon size={14} />}
        label={table.name}
        matchQuery={matchQuery}
        open={open}
        active={active}
        title={`${schema}.${table.name}`}
        trailing={<span className="nmeta">{fmtCount(table.estRows)}</span>}
        onClick={onOpenTable}
        onChevronClick={onToggleColumns}
      />
      {open && children}
    </>
  );
}
