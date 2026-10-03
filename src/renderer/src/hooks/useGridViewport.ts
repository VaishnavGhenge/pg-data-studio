import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";

export function useGridViewport(
  tableRef: RefObject<HTMLTableElement | null>,
  rowCount: number,
  columnCount: number,
) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({
    top: 0,
    left: 0,
    width: 1000,
    height: 500,
    rowHeight: 28,
    headerHeight: 34,
  });
  const syncScroll = useCallback(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    setViewport((old) => {
      // Overscan covers these small steps. Keep the mounted rows/columns stable
      // between steps so native scrolling need not relayout the table each pixel.
      const top = Math.floor(scroll.scrollTop / (old.rowHeight * 4)) * old.rowHeight * 4;
      const left = Math.floor(scroll.scrollLeft / 64) * 64;
      return old.top === top && old.left === left ? old : { ...old, top, left };
    });
  }, []);

  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    let frame = 0;
    const measure = () => {
      const row = tableRef.current?.querySelector(".grid-data-row");
      const header = tableRef.current?.querySelector("thead");
      const rowHeight = row?.getBoundingClientRect().height;
      const headerHeight = header?.getBoundingClientRect().height;
      setViewport((old) => {
        const next = {
          top:
            Math.floor(scroll.scrollTop / ((rowHeight || old.rowHeight) * 4)) *
            (rowHeight || old.rowHeight) *
            4,
          left: Math.floor(scroll.scrollLeft / 64) * 64,
          width: scroll.clientWidth,
          height: scroll.clientHeight,
          rowHeight: rowHeight || old.rowHeight,
          headerHeight: headerHeight || old.headerHeight,
        };
        return Object.keys(next).every(
          (key) => next[key as keyof typeof next] === old[key as keyof typeof old],
        )
          ? old
          : next;
      });
    };
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        syncScroll();
      });
    };
    const resize = new ResizeObserver(measure);
    resize.observe(scroll);
    const row = tableRef.current?.querySelector(".grid-data-row");
    const header = tableRef.current?.querySelector("thead");
    if (row) resize.observe(row);
    if (header) resize.observe(header);
    const display = new MutationObserver(measure);
    display.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["style", "data-density"],
    });
    scroll.addEventListener("scroll", onScroll, { passive: true });
    measure();
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      display.disconnect();
      scroll.removeEventListener("scroll", onScroll);
    };
  }, [tableRef, syncScroll, rowCount, columnCount]);

  return { scrollRef, viewport, syncScroll };
}
