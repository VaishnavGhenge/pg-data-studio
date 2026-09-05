import { ChevronLeftIcon, ChevronRightIcon } from "../common/icons";

interface PagerProps {
  offset: number;
  loadedRowCount: number;
  hasMore: boolean;
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
}

export function Pager({ offset, loadedRowCount, hasMore, onPrev, onNext, disabled }: PagerProps) {
  // Shown once there's more than one page's worth of data to move through.
  const from = loadedRowCount ? offset + 1 : 0;
  const to = loadedRowCount ? offset + loadedRowCount : 0;
  return (
    <div className="pager">
      <button
        className="pager-btn"
        title="Previous page"
        aria-label="Previous page"
        disabled={disabled || offset === 0}
        onClick={onPrev}
      >
        <ChevronLeftIcon size={12} />
      </button>
      <span className="pager-range">
        Rows {from}–{to}
      </span>
      <button
        className="pager-btn"
        title="Next page"
        aria-label="Next page"
        disabled={disabled || !hasMore}
        onClick={onNext}
      >
        <ChevronRightIcon size={12} />
      </button>
    </div>
  );
}
