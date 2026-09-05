// Drag-to-resize the sidebar, persisted to localStorage as a raw CSS length
// (e.g. "280px") on the documentElement's --side-w custom property — mirrors
// the old renderer's initSplitter() exactly, including the 180-560px clamp.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";

const MIN_WIDTH = 180;
const MAX_WIDTH = 560;
const STORAGE_KEY = "sideW";

export function useSplitterWidth() {
  const sideRef = useRef<HTMLElement>(null);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) document.documentElement.style.setProperty("--side-w", saved);
    } catch {
      /* localStorage may be unavailable; width just won't persist */
    }
  }, []);

  const onMouseDown = useCallback((e: ReactMouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = sideRef.current?.getBoundingClientRect().width ?? 240;
    setDragging(true);
    document.body.classList.add("col-resizing");

    const onMove = (ev: MouseEvent) => {
      const w = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startW + (ev.clientX - startX)));
      document.documentElement.style.setProperty("--side-w", w + "px");
    };
    const onUp = () => {
      setDragging(false);
      document.body.classList.remove("col-resizing");
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      try {
        localStorage.setItem(
          STORAGE_KEY,
          document.documentElement.style.getPropertyValue("--side-w"),
        );
      } catch {
        /* ignore */
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  return { sideRef, dragging, onMouseDown };
}
