import { useSourcesState } from "../../state/sourcesStore";

export function Titlebar() {
  const { dbMeta } = useSourcesState();
  return (
    <div className="titlebar">
      <span className="titlebar-name">PG Data Studio</span>
      <span className="titlebar-conn">{dbMeta ? `${dbMeta.database} · ${dbMeta.host}` : ""}</span>
    </div>
  );
}
