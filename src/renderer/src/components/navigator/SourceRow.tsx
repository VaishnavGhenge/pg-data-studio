import type { MouseEvent, ReactNode } from "react";
import { NavRow } from "./NavRow";
import { DatabaseIcon } from "../common/icons";

interface SourceRowProps {
  source: Source;
  status: "off" | "connecting" | "error" | "connected";
  open: boolean;
  onClick: () => void;
  onContextMenu: (e: MouseEvent) => void;
  children?: ReactNode;
}

export function SourceRow({ source, status, open, onClick, onContextMenu, children }: SourceRowProps) {
  return (
    <>
      <NavRow
        kind="source"
        depth={0}
        icon={<DatabaseIcon size={15} />}
        label={source.name}
        open={open}
        title={`${source.host}:${source.port}/${source.database}`}
        onClick={onClick}
        onContextMenu={onContextMenu}
        trailing={<span className={"ndot " + status} />}
      />
      {open && children}
    </>
  );
}
