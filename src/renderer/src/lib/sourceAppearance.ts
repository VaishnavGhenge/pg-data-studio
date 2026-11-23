// Per-source color and environment label, kept on this device. A color marks
// which database a window is pointed at (production red, staging amber), so
// it is opt-in: an empty color means the source is not marked at all.

import { useEffect, useState } from "react";
import { readPreference, writePreference } from "./preferences";

export interface SourceAppearance {
  color: string;
  environment: string;
}

export const NO_APPEARANCE: SourceAppearance = { color: "", environment: "" };

// The old default every source got without anyone choosing it.
const LEGACY_DEFAULT_COLOR = "#708d75";

export const APPEARANCE_PRESETS: { label: string; color: string }[] = [
  { label: "Production", color: "#d64541" },
  { label: "Staging", color: "#d9952b" },
  { label: "Development", color: "#3c9a5f" },
];

const EVENT = "source-appearance-change";
const key = (id: string) => "source-appearance:" + id;

export function readAppearance(id: string | null): SourceAppearance {
  if (!id) return NO_APPEARANCE;
  const stored = readPreference<Partial<SourceAppearance>>(key(id), NO_APPEARANCE);
  const color = typeof stored.color === "string" ? stored.color : "";
  const environment = typeof stored.environment === "string" ? stored.environment : "";
  return {
    color: color.toLowerCase() === LEGACY_DEFAULT_COLOR ? "" : color,
    environment,
  };
}

export function writeAppearance(id: string, next: SourceAppearance): void {
  writePreference(key(id), next);
  window.dispatchEvent(new Event(EVENT));
}

export function useSourceAppearance(id: string | null): SourceAppearance {
  const [appearance, setAppearance] = useState(() => readAppearance(id));
  useEffect(() => {
    const update = () => setAppearance(readAppearance(id));
    update();
    window.addEventListener(EVENT, update);
    return () => window.removeEventListener(EVENT, update);
  }, [id]);
  return appearance;
}
