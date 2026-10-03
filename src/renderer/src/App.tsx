import "./styles.css";
import "./workspace.css";
import { AppProviders } from "./state/AppProviders";
import { AppShell } from "./components/layout/AppShell";
import { Toast } from "./components/common/Toast";
import { ConfirmDialog } from "./components/common/ConfirmDialog";

export function App() {
  return (
    <AppProviders>
      <AppShell />
      <Toast />
      <ConfirmDialog />
    </AppProviders>
  );
}
