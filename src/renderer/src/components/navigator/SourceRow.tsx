import type { MouseEvent, ReactNode } from "react";
import { NavRow } from "./NavRow";
import { DatabaseIcon, MoreIcon } from "../common/icons";

interface SourceRowProps {
  source: Source;
  status: "off" | "connecting" | "error" | "connected";
  /** The last connect failure, kept on the row after the toast is gone. */
  error?: string;
  open: boolean;
  onClick: () => void;
  onContextMenu: (e: MouseEvent) => void;
  children?: ReactNode;
}

export function SourceRow({
  source,
  status,
  error,
  open,
  onClick,
  onContextMenu,
  children,
}: SourceRowProps) {
  return (
    <>
      <NavRow
        kind="source"
        depth={0}
        icon={<DatabaseIcon size={15} />}
        label={source.name}
        subLabel={
          error ? (
            <span className="nav-sublabel-error">Couldn't connect. Click to retry.</span>
          ) : (
            `${source.database} · ${source.host}`
          )
        }
        open={open}
        title={error ?? `${source.host}:${source.port}/${source.database}`}
        onClick={onClick}
        onContextMenu={onContextMenu}
        trailing={
          <>
            <span
              className={"ndot " + status}
              title={
                error ??
                {
                  off: "Disconnected",
                  connecting: "Connecting",
                  error: "Error",
                  connected: "Connected",
                }[status]
              }
            />
            <button
              className="icon-btn source-menu"
              aria-label={`Connection actions for ${source.name}`}
              title="Connection actions"
              onClick={(e) => {
                e.stopPropagation();
                onContextMenu(e);
              }}
            >
              <MoreIcon size={15} />
            </button>
          </>
        }
      />
      {open && children}
    </>
  );
}
