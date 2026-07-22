import { ChevronLeftIcon, ChevronRightIcon } from "../common/icons";

interface PagerProps {
  offset: number;
  loadedRowCount: number;
  hasMore: boolean;
  onPrev: () => void;
  onNext: () => void;
}

export function Pager({ offset, loadedRowCount, hasMore, onPrev, onNext }: PagerProps) {
  // Shown once there's more than one page's worth of data to move through.
  if (offset === 0 && !hasMore) return null;
  const from = loadedRowCount ? offset + 1 : 0;
  const to = offset + loadedRowCount;
  return (
    <div className="pager">
      <button
        className="pager-btn"
        title="Previous page"
        aria-label="Previous page"
        disabled={offset === 0}
        onClick={onPrev}
      >
        <ChevronLeftIcon size={12} />
      </button>
      <span className="pager-range">
        {from}–{to}
      </span>
      <button
        className="pager-btn"
        title="Next page"
        aria-label="Next page"
        disabled={!hasMore}
        onClick={onNext}
      >
        <ChevronRightIcon size={12} />
      </button>
    </div>
  );
}
