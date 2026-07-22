// Cross-cutting connection state: which saved source is connected/connecting/
// erroring, and the last-connected db's metadata (for the titlebar). Read by
// Titlebar, Sidebar, and SourceModal. Deliberately does NOT hold the
// navigator's expanded/lazy-column state — nothing outside the tree needs it,
// so it stays local to NavigatorTree instead of causing tree-wide re-renders
// on every unrelated Sources change.

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";

export interface SourcesState {
  sources: Source[];
  connectedId: string | null;
  connectingId: string | null;
  errorId: string | null;
  dbMeta: DbMeta | null;
}

const initialState: SourcesState = {
  sources: [],
  connectedId: null,
  connectingId: null,
  errorId: null,
  dbMeta: null,
};

export type SourcesAction =
  | { type: "SOURCES_SET"; sources: Source[] }
  | { type: "CONNECT_START"; id: string }
  | { type: "CONNECT_SUCCESS"; id: string; meta: DbMeta }
  | { type: "CONNECT_ERROR"; id: string }
  | { type: "DISCONNECTED" };

function sourcesReducer(state: SourcesState, action: SourcesAction): SourcesState {
  switch (action.type) {
    case "SOURCES_SET":
      return { ...state, sources: action.sources };
    case "CONNECT_START":
      return { ...state, connectingId: action.id, errorId: null };
    case "CONNECT_SUCCESS":
      return {
        ...state,
        connectingId: null,
        connectedId: action.id,
        errorId: null,
        dbMeta: action.meta,
      };
    case "CONNECT_ERROR":
      return { ...state, connectingId: null, errorId: action.id };
    case "DISCONNECTED":
      return { ...state, connectedId: null, errorId: null, dbMeta: null };
    default:
      return state;
  }
}

const StateCtx = createContext<SourcesState | null>(null);
const DispatchCtx = createContext<Dispatch<SourcesAction> | null>(null);

export function SourcesProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sourcesReducer, initialState);
  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useSourcesState(): SourcesState {
  const ctx = useContext(StateCtx);
  if (!ctx) throw new Error("useSourcesState must be used within SourcesProvider");
  return ctx;
}

export function useSourcesDispatch(): Dispatch<SourcesAction> {
  const ctx = useContext(DispatchCtx);
  if (!ctx) throw new Error("useSourcesDispatch must be used within SourcesProvider");
  return ctx;
}
