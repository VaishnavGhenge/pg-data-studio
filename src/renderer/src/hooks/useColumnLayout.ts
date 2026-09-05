import { useEffect, useRef, useState, type MouseEvent } from "react";
import { readPreference, writePreference } from "../lib/preferences";

export interface ColumnLayout {
  widths: Record<string, number>;
  hidden: string[];
  pinned: string[];
}
export const defaultColumnLayout = (): ColumnLayout => ({ widths: {}, hidden: [], pinned: [] });

export function useColumnLayout(storageKey: string) {
  const [layout, setLayout] = useState<ColumnLayout>(() =>
    readPreference(storageKey, defaultColumnLayout()),
  );
  const cleanupRef = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanupRef.current?.(), []);
  useEffect(() => {
    writePreference(storageKey, layout);
  }, [storageKey, layout]);

  function resize(event: MouseEvent, name: string) {
    event.preventDefault();
    const startX = event.clientX;
    const width = layout.widths[name] ?? 160;
    cleanupRef.current?.();
    let frame = 0;
    const onMove = (e: globalThis.MouseEvent) => {
      cancelAnimationFrame(frame);
      const nextWidth = Math.max(70, Math.min(900, width + e.clientX - startX));
      frame = requestAnimationFrame(() =>
        setLayout((previous) => ({
          ...previous,
          widths: { ...previous.widths, [name]: nextWidth },
        })),
      );
    };
    const cleanup = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", cleanup);
    };
    cleanupRef.current = () => {
      cleanup();
      cancelAnimationFrame(frame);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", cleanup);
  }

  function autoFit(name: string, values: string[], font: string) {
    const context = document.createElement("canvas").getContext("2d");
    if (!context) return;
    context.font = font;
    const width = Math.min(
      600,
      Math.max(
        90,
        ...[name, ...values].map((value) => context.measureText(value.split("\n")[0]).width + 48),
      ),
    );
    setLayout((previous) => ({ ...previous, widths: { ...previous.widths, [name]: width } }));
  }
  return { layout, setLayout, resize, autoFit };
}
