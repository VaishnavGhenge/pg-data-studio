import { useEffect, useState } from "react";
import { Modal } from "../common/Modal";
import { readPreference, writePreference } from "../../lib/preferences";
import { useSourcesState } from "../../state/sourcesStore";
import { CloseIcon, SettingsIcon } from "../common/icons";

interface Preferences {
  theme: "light" | "dark" | "system";
  density: "compact" | "comfortable";
  fontSize: number;
  motion?: "auto" | "reduced";
}
export interface SourceAppearance {
  color: string;
  environment: string;
}
export function DisplaySettings() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>(() =>
    readPreference("display", {
      theme: "system",
      density: "compact",
      fontSize: 12,
      motion: "auto",
    }),
  );
  const { connectedId } = useSourcesState();
  const [appearance, setAppearance] = useState<SourceAppearance>({
    color: "#708d75",
    environment: "",
  });
  useEffect(() => {
    setAppearance(
      readPreference("source-appearance:" + connectedId, { color: "#708d75", environment: "" }),
    );
  }, [connectedId]);
  useEffect(() => {
    writePreference("display", prefs);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        prefs.theme === "system" ? (media.matches ? "dark" : "light") : prefs.theme;
    };
    apply();
    media.addEventListener("change", apply);
    document.documentElement.dataset.density = prefs.density;
    document.documentElement.dataset.motion = prefs.motion ?? "auto";
    document.documentElement.style.setProperty("--grid-font-size", prefs.fontSize + "px");
    return () => media.removeEventListener("change", apply);
  }, [prefs]);
  function updateAppearance(next: SourceAppearance) {
    setAppearance(next);
    writePreference("source-appearance:" + connectedId, next);
    window.dispatchEvent(new Event("source-appearance-change"));
  }
  return (
    <>
      <button
        className="titlebar-btn"
        onClick={() => setOpen(true)}
        aria-label="Display settings"
        title="Display settings"
      >
        <SettingsIcon size={16} />
        <span>Display settings</span>
      </button>
      <Modal open={open} onClose={() => setOpen(false)} labelledBy="display-title">
        <div className="modal-head">
          <div>
            <h2 id="display-title">Display settings</h2>
          </div>
          <button
            className="icon-btn"
            aria-label="Close display settings"
            onClick={() => setOpen(false)}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="settings-form">
          <label>
            Theme
            <select
              autoFocus
              value={prefs.theme}
              onChange={(e) =>
                setPrefs({ ...prefs, theme: e.target.value as Preferences["theme"] })
              }
            >
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </label>
          <label>
            Row density
            <select
              value={prefs.density}
              onChange={(e) =>
                setPrefs({ ...prefs, density: e.target.value as Preferences["density"] })
              }
            >
              <option value="compact">Compact</option>
              <option value="comfortable">Comfortable</option>
            </select>
          </label>
          <label>
            Grid font size
            <select
              value={prefs.fontSize}
              onChange={(e) => setPrefs({ ...prefs, fontSize: Number(e.target.value) })}
            >
              {[11, 12, 13, 14, 16, 18].map((size) => (
                <option key={size} value={size}>
                  {size}px
                </option>
              ))}
            </select>
          </label>
          <label>
            Interface motion
            <select
              value={prefs.motion ?? "auto"}
              onChange={(e) => setPrefs({ ...prefs, motion: e.target.value as "auto" | "reduced" })}
            >
              <option value="auto">Minimal transitions</option>
              <option value="reduced">Reduced motion</option>
            </select>
          </label>
          {connectedId && (
            <>
              <label>
                Connection color
                <input
                  type="color"
                  value={appearance.color}
                  onChange={(e) => updateAppearance({ ...appearance, color: e.target.value })}
                />
              </label>
              <label>
                Environment label
                <input
                  placeholder="Local, staging, production…"
                  maxLength={40}
                  value={appearance.environment}
                  onChange={(e) => updateAppearance({ ...appearance, environment: e.target.value })}
                />
              </label>
            </>
          )}
        </div>
        <p className="muted">Preferences are saved automatically on this device.</p>
        <button className="btn primary" onClick={() => setOpen(false)}>
          Done
        </button>
      </Modal>
    </>
  );
}
