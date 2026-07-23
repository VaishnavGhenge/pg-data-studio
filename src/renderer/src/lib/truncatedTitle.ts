// Sets a native `title` tooltip lazily, only when the element is actually
// clipping its own text (scrollWidth > clientWidth) — computed on hover
// rather than for every row up front, so it stays cheap even inside a
// 200-row grid, and never shows a tooltip for content that already fits.
export function showTitleIfTruncated(e: { currentTarget: HTMLElement }): void {
  const el = e.currentTarget;
  if (el.scrollWidth > el.clientWidth) {
    const text = el.textContent ?? "";
    if (el.title !== text) el.title = text;
  } else if (el.title) {
    el.removeAttribute("title");
  }
}
