// Orchestrates data-source IPC calls + the Sources/Table context dispatches
// they trigger. Shared by Sidebar, SourceModal, and SourceContextMenu.

import { useCallback } from "react";
import { useSourcesDispatch, useSourcesState } from "../state/sourcesStore";
import { useTableDispatch, useTableState } from "../state/tableStore";
import { useConfirm, useConfirmDiscard } from "../state/confirmStore";
import { useToast } from "../state/toastStore";
import { unwrap, unwrapOr } from "./useApi";

export function useSourceActions() {
  const sourcesDispatch = useSourcesDispatch();
  const { sources, connectedId } = useSourcesState();
  const tableDispatch = useTableDispatch();
  const { dirty } = useTableState();
  const confirmDiscard = useConfirmDiscard();
  const confirm = useConfirm();
  const { show: toast } = useToast();

  const refreshSources = useCallback(async (): Promise<Source[]> => {
    const list = await unwrapOr(window.api.listSources(), []);
    sourcesDispatch({ type: "SOURCES_SET", sources: list });
    return list;
  }, [sourcesDispatch]);

  const connect = useCallback(
    async (src: Source): Promise<void> => {
      if (Object.keys(dirty).length && !(await confirmDiscard())) return;
      sourcesDispatch({ type: "CONNECT_START", id: src.id });
      try {
        const meta = await unwrap(window.api.connect(src));
        sourcesDispatch({ type: "CONNECT_SUCCESS", id: src.id, meta });
        tableDispatch({ type: "CLEAR_WORKSPACE" });
      } catch (e) {
        sourcesDispatch({ type: "CONNECT_ERROR", id: src.id });
        toast(e instanceof Error ? e.message : String(e), true);
      }
    },
    [dirty, confirmDiscard, sourcesDispatch, tableDispatch, toast]
  );

  const disconnect = useCallback(async (): Promise<void> => {
    if (Object.keys(dirty).length && !(await confirmDiscard())) return;
    await unwrap(window.api.disconnect());
    sourcesDispatch({ type: "DISCONNECTED" });
    tableDispatch({ type: "CLEAR_WORKSPACE" });
  }, [dirty, confirmDiscard, sourcesDispatch, tableDispatch]);

  // Upsert; throws on failure so a caller with an inline error area (the
  // source modal) can show it there instead of a global toast.
  const saveSource = useCallback(
    async (s: Source): Promise<Source> => {
      const saved = await unwrap(window.api.saveSource(s));
      await refreshSources();
      return saved;
    },
    [refreshSources]
  );

  const deleteSource = useCallback(
    async (id: string): Promise<void> => {
      const src = sources.find((s) => s.id === id);
      if (!src) return;
      const ok = await confirm({
        title: `Delete "${src.name}"?`,
        body: "This removes the saved connection. It won't touch the database itself.",
        okLabel: "Delete",
        danger: true,
      });
      if (!ok) return;
      if (connectedId === id) await disconnect();
      await unwrap(window.api.deleteSource(id));
      await refreshSources();
    },
    [sources, connectedId, confirm, disconnect, refreshSources]
  );

  const duplicateSource = useCallback(
    async (id: string): Promise<void> => {
      const src = sources.find((s) => s.id === id);
      if (!src) return;
      try {
        await saveSource({ ...src, id: "", name: src.name + " (copy)" });
        toast("✓ Duplicated");
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), true);
      }
    },
    [sources, saveSource, toast]
  );

  return { refreshSources, connect, disconnect, saveSource, deleteSource, duplicateSource };
}
