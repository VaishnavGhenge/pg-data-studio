import { useSourcesState } from "../../state/sourcesStore";
import { useEffect, useState } from "react";
import { DisplaySettings, type SourceAppearance } from "./DisplaySettings";
import { readPreference } from "../../lib/preferences";

export function Titlebar() {
  const { dbMeta, connectedId, connectingId } = useSourcesState();
  const [appearance, setAppearance] = useState<SourceAppearance>({
    color: "#4c8dff",
    environment: "",
  });
  useEffect(() => {
    const update = () =>
      setAppearance(
        readPreference("source-appearance:" + connectedId, { color: "#4c8dff", environment: "" }),
      );
    update();
    window.addEventListener("source-appearance-change", update);
    return () => window.removeEventListener("source-appearance-change", update);
  }, [connectedId]);
  return (
    <div className="titlebar">
      <span className="titlebar-name">PG Data Studio</span>
      <span className="titlebar-conn">{dbMeta ? `${dbMeta.database} · ${dbMeta.host}` : ""}</span>
      {connectedId && (
        <span
          className="environment-badge"
          style={{ borderColor: appearance.color, color: appearance.color }}
        >
          {appearance.environment || "Connected"}
        </span>
      )}
      {connectingId && <span role="status">Connecting…</span>}
      <DisplaySettings />
    </div>
  );
}
