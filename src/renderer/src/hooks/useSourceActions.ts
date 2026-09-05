// Orchestrates data-source IPC calls + the Sources/Table context dispatches
// they trigger. Shared by Sidebar, SourceModal, and SourceContextMenu.

import { useCallback } from "react";
import { useSourcesDispatch, useSourcesState } from "../state/sourcesStore";
import { useTableDispatch, useTableState, useWorkspaceRequests } from "../state/tableStore";
import { useConfirm, useConfirmDiscard } from "../state/confirmStore";
import { useToast } from "../state/toastStore";
import { unwrap } from "./useApi";

export function useSourceActions() {
  const sourcesDispatch = useSourcesDispatch();
  const { sources, connectedId } = useSourcesState();
  const tableDispatch = useTableDispatch();
  const tableState = useTableState();
  const { dirty } = tableState;
  const hasEdits =
    Object.keys(dirty).length > 0 ||
    Object.entries(tableState.snapshots).some(
      ([id, tab]) =>
        id !== JSON.stringify([tableState.current?.schema, tableState.current?.name]) &&
        Object.keys(tab.dirty).length > 0,
    );
  const confirmDiscard = useConfirmDiscard();
  const confirm = useConfirm();
  const { show: toast } = useToast();
  const requests = useWorkspaceRequests();

  const refreshSources = useCallback(async (): Promise<Source[]> => {
    const list = await unwrap(window.api.listSources());
    sourcesDispatch({ type: "SOURCES_SET", sources: list });
    return list;
  }, [sourcesDispatch]);

  const connect = useCallback(
    async (src: Source): Promise<void> => {
      if (requests.busy) return;
      const version = requests.version;
      if (hasEdits && !(await confirmDiscard())) return;
      if (!requests.isCurrent(version) || !requests.lock()) return;
      sourcesDispatch({ type: "CONNECT_START", id: src.id });
      try {
        const meta = await unwrap(window.api.connect(src));
        sourcesDispatch({ type: "CONNECT_SUCCESS", id: src.id, meta });
        tableDispatch({ type: "CLEAR_WORKSPACE" });
      } catch (e) {
        sourcesDispatch({ type: "CONNECT_ERROR", id: src.id });
        toast(e instanceof Error ? e.message : String(e), true);
      } finally {
        tableDispatch({ type: "QUERY_CANCEL" });
        requests.busy = false;
      }
    },
    [hasEdits, confirmDiscard, sourcesDispatch, tableDispatch, toast, requests],
  );

  const disconnect = useCallback(async (): Promise<boolean> => {
    if (requests.busy) return false;
    const version = requests.version;
    if (hasEdits && !(await confirmDiscard())) return false;
    if (!requests.isCurrent(version) || !requests.lock()) return false;
    try {
      await unwrap(window.api.disconnect());
      sourcesDispatch({ type: "DISCONNECTED" });
      tableDispatch({ type: "CLEAR_WORKSPACE" });
      return true;
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
      return false;
    } finally {
      requests.busy = false;
    }
  }, [hasEdits, confirmDiscard, sourcesDispatch, tableDispatch, requests, toast]);

  // Upsert; throws on failure so a caller with an inline error area (the
  // source modal) can show it there instead of a global toast.
  const saveSource = useCallback(
    async (s: Source): Promise<Source> => {
      const saved = await unwrap(window.api.saveSource(s));
      await refreshSources();
      return saved;
    },
    [refreshSources],
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
      if (connectedId === id && !(await disconnect())) return;
      try {
        await unwrap(window.api.deleteSource(id));
        await refreshSources();
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), true);
      }
    },
    [sources, connectedId, confirm, disconnect, refreshSources, toast],
  );

  const duplicateSource = useCallback(
    async (id: string): Promise<void> => {
      const src = sources.find((s) => s.id === id);
      if (!src) return;
      try {
        await saveSource({ ...src, id: "", name: src.name + " (copy)" });
        toast("Duplicated");
      } catch (e) {
        toast(e instanceof Error ? e.message : String(e), true);
      }
    },
    [sources, saveSource, toast],
  );

  return { refreshSources, connect, disconnect, saveSource, deleteSource, duplicateSource };
}
