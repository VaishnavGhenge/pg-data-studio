import type { ReactNode } from "react";
import { SourcesProvider } from "./sourcesStore";
import { TableProvider } from "./tableStore";
import { ToastProvider } from "./toastStore";
import { ConfirmProvider } from "./confirmStore";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <SourcesProvider>
      <TableProvider>
        <ToastProvider>
          <ConfirmProvider>{children}</ConfirmProvider>
        </ToastProvider>
      </TableProvider>
    </SourcesProvider>
  );
}
