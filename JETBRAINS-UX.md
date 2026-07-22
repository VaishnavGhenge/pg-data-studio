# JetBrains / DataGrip UX behaviors — backlog

A menu of data-editor behaviors to pull from, tagged by effort (S = small,
M = medium). Checked = done in PG Data Studio.

## Shortlist — small & high-impact

- [ ] **1. Type-to-filter the table list** (S) — the biggest win; DBs have 100s of tables.
- [ ] **2. Full-name tooltip on truncated tables** (S).
- [ ] **3. Right-click cell → Filter by value / Copy / Set NULL** (M).
- [ ] **4. Copy cell / selection as TSV (⌘C)** (S).
- [ ] **5. Expand a cell (value viewer) for long/JSON/date values** (S–M).
- [ ] **6. Keyboard nav in the grid** (arrows move, Enter edits, Esc cancels) (M).
- [ ] **7. Selection aggregate in a status bar** (count / sum / avg of selected cells) (S).
- [ ] **8. Reset all filters & sort** button (S).

## Full menu by area

### Table list / navigation
- [ ] Type-to-filter (speed search)
- [ ] Full-name tooltip on hover
- [ ] Keyboard up/down + Enter to open
- [ ] Object icons per type (table / view / materialized view)
- [ ] Collapsible schema groups
- [ ] Sort tables by name or size
- [ ] Remember last-opened table on reconnect
- [ ] Favorites / pinned tables

### Data grid — viewing
- [ ] Cell selection (not just edit) + range selection
- [ ] Row-number gutter click selects the row
- [ ] Column resize (drag border)
- [ ] Column auto-fit (double-click border)
- [ ] Column reorder
- [ ] Hide / pin columns
- [ ] Value viewer panel for big / JSON / date values
- [ ] Wrap vs. truncate toggle for long text
- [ ] Booleans as checkboxes
- [x] Right-aligned numbers
- [x] NULL styling
- [x] Zebra striping
- [ ] Transpose (single row as key→value form)
- [ ] ⌘F search-in-results highlighting

### Data grid — editing
- [ ] Add row / delete row (+ / −)
- [ ] Clone row
- [ ] Set NULL shortcut
- [ ] Multi-cell paste from clipboard
- [ ] Undo / redo edits
- [ ] ⌘Enter to submit
- [x] Revert
- [x] Per-row UPDATE preview
- [x] Empty a cell to set NULL

### Query / filter / sort
- [x] WHERE bar (raw SQL)
- [x] Per-column filters
- [x] Single-column sort via header
- [ ] ORDER BY bar + multi-column sort (Shift-click)
- [ ] Page-size selector + jump-to-page + first / last
- [x] Prev / Next paging
- [ ] Exact row count on demand
- [ ] Reset all filters & sort

### Data out
- [ ] Copy as TSV / CSV / JSON / SQL INSERT
- [ ] Export result to file
- [x] Copy the running SQL is visible (preview bar)

### Chrome / feedback
- [ ] Status bar (connection, row count, selection stats)
- [ ] Tabs for multiple tables / results
- [x] Inline / toast errors
- [x] Column header shows type
- [ ] Column header nullability + FK badge + comment
- [x] PK badge on columns
