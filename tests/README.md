# Renderer checks

Run `npm test` and `npm run typecheck` for unit/regression checks.

After `npm run build`, run the browser interaction checks with Node 22 or newer:

```sh
CHROME_PATH=/usr/bin/google-chrome node tests/ui-smoke.cjs
```

The smoke test covers editing, undo/redo, tabs, review, TSV, columns, inspector,
theme, pagination and row counts. Its wide-grid scenario also checks offscreen
navigation/editing, copying all 1,000 rows and 64 columns, pinned columns, and
row measurements after density/font changes.

## Performance comparison

Preserve a production renderer before changing it, then test both builds on the
same PC. Run each measurement alone, without a concurrent test or recording:

```sh
npm run build
mkdir -p release/performance
cp -a out/renderer release/performance/before-renderer
RENDERER_ROOT=release/performance/before-renderer PERF_LABEL=before node tests/performance.cjs
# Make the rendering changes, then build again.
npm run build
PERF_LABEL=after PERF_EXPECT_VIRTUAL=1 node tests/performance.cjs
```

The harness requires Node 22+ and Chrome. `CHROME_PATH` selects another Chrome
binary; `PERF_OUTPUT` selects the JSON output path. Each build uses an isolated
browser profile, identical deterministic 64-column data, a 1920×1016 viewport,
and three repetitions at 200 and 1,000 rows per page. Raw samples include load
time, mounted cells, JavaScript heap after GC, keyboard/selection latency,
scroll-frame intervals, and Chrome script/layout/style/task durations.

Input timings wait for two animation frames, giving them a roughly 32 ms floor
on a 60 Hz display. Load time at 1,000 rows includes opening the initial 200-row
page and switching page size. Database and IPC latency are excluded. Headless
scroll timings measure this scripted workload; they are not native Electron GPU
FPS or an end-to-end database benchmark. Keep the native videos as separate
visual evidence, since recording adds overhead.

Results live in ignored `release/performance/`; use the JSON samples and renderer
hashes when describing a comparison. The Git revision alone cannot distinguish
uncommitted rendering changes.
