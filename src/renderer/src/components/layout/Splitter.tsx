import type { MouseEvent } from "react";

interface SplitterProps {
  dragging: boolean;
  onMouseDown: (e: MouseEvent) => void;
}

export function Splitter({ dragging, onMouseDown }: SplitterProps) {
  return (
    <div
      className={dragging ? "splitter dragging" : "splitter"}
      role="separator"
      aria-orientation="vertical"
      title="Drag to resize"
      onMouseDown={onMouseDown}
    />
  );
}
