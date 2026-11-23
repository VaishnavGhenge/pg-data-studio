import { useEffect, useState } from "react";
import { Modal } from "../common/Modal";
import { readPreference, writePreference } from "../../lib/preferences";
import {
  APPEARANCE_PRESETS,
  useSourceAppearance,
  writeAppearance,
  type SourceAppearance,
} from "../../lib/sourceAppearance";
import { useSourcesState } from "../../state/sourcesStore";
import { CloseIcon, SettingsIcon } from "../common/icons";

interface Preferences {
  theme: "light" | "dark" | "system";
  density: "compact" | "comfortable";
  fontSize: number;
  motion?: "auto" | "reduced";
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
  const appearance = useSourceAppearance(connectedId);
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
    if (connectedId) writeAppearance(connectedId, next);
  }
  const isPreset = APPEARANCE_PRESETS.some((p) => p.color === appearance.color);
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
              <div className="settings-row">
                <span id="connection-color-label">Connection color</span>
                <div
                  className="color-choices"
                  role="radiogroup"
                  aria-labelledby="connection-color-label"
                >
                  <button
                    className="color-choice none"
                    role="radio"
                    aria-checked={!appearance.color}
                    aria-label="No color"
                    title="No color"
                    onClick={() => updateAppearance({ ...appearance, color: "" })}
                  />
                  {APPEARANCE_PRESETS.map((preset) => (
                    <button
                      key={preset.color}
                      className="color-choice"
                      role="radio"
                      aria-checked={appearance.color === preset.color}
                      aria-label={preset.label}
                      title={preset.label}
                      style={{ background: preset.color }}
                      onClick={() =>
                        updateAppearance({
                          color: preset.color,
                          // Replace an empty or preset label; keep one the user typed.
                          environment:
                            !appearance.environment ||
                            APPEARANCE_PRESETS.some((p) => p.label === appearance.environment)
                              ? preset.label
                              : appearance.environment,
                        })
                      }
                    />
                  ))}
                  <label
                    className="color-choice custom"
                    title="Custom color"
                    data-checked={!!appearance.color && !isPreset}
                    style={
                      appearance.color && !isPreset ? { background: appearance.color } : undefined
                    }
                  >
                    <input
                      type="color"
                      aria-label="Custom color"
                      value={appearance.color || "#6b7280"}
                      onChange={(e) => updateAppearance({ ...appearance, color: e.target.value })}
                    />
                  </label>
                </div>
              </div>
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
