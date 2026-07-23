import type { ReactNode } from "react";
import { NavRow } from "./NavRow";
import { SchemaIcon } from "../common/icons";

interface SchemaRowProps {
  schema: string;
  open: boolean;
  onClick: () => void;
  children?: ReactNode;
}

export function SchemaRow({ schema, open, onClick, children }: SchemaRowProps) {
  return (
    <>
      <NavRow
        kind="schema"
        depth={1}
        icon={<SchemaIcon size={14} />}
        label={schema}
        open={open}
        title={schema}
        onClick={onClick}
      />
      {open && children}
    </>
  );
}
