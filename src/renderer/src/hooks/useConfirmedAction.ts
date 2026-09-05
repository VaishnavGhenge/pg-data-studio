// Centralizes the "dirty? confirm discard first" guard that the old renderer
// repeated at 7 call sites (switch source, disconnect, open a different
// table, page, apply WHERE, apply/clear a column filter, change sort).

import { useCallback } from "react";
import { useTableState, useWorkspaceRequests } from "../state/tableStore";
import { useConfirmDiscard } from "../state/confirmStore";

// Returns whether the action actually ran (false only when the user declined
// the discard confirmation) — most callers ignore this, but a couple of UI
// elements (the column filter popover) need to know whether to close
// themselves or stay open, matching the old renderer exactly.
export function useConfirmedAction() {
  const { dirty } = useTableState();
  const confirmDiscard = useConfirmDiscard();
  const requests = useWorkspaceRequests();

  return useCallback(
    async (action: () => void | Promise<void>): Promise<boolean> => {
      if (requests.busy) return false;
      const version = requests.version;
      if (Object.keys(dirty).length > 0) {
        const ok = await confirmDiscard();
        if (!ok) return false;
      }
      if (requests.busy || !requests.isCurrent(version)) return false;
      await action();
      return true;
    },
    [dirty, confirmDiscard, requests],
  );
}
