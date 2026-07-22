import "./styles.css";
import { AppProviders } from "./state/AppProviders";
import { Titlebar } from "./components/layout/Titlebar";
import { AppShell } from "./components/layout/AppShell";
import { Toast } from "./components/common/Toast";
import { ConfirmDialog } from "./components/common/ConfirmDialog";

export function App() {
  return (
    <AppProviders>
      <Titlebar />
      <AppShell />
      <Toast />
      <ConfirmDialog />
    </AppProviders>
  );
}
