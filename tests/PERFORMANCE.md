# Renderer performance — 2026-10-03

Measured on Intel Core i5-9300H, Chrome 154.0.8037.92, 1920 × 1016, deterministic 64-column data, three repetitions per page size. Values below are medians across repetitions, except slow frames, which are summed.

| Build                          | Rows | Load (ms) | Mounted cells | Selection (ms) | Scroll frame p95 (ms) | Frames >50 ms | JS heap (MiB) |
| ------------------------------ | ---: | --------: | ------------: | -------------: | --------------------: | ------------: | ------------: |
| Original                       |  200 |     818.1 |         12800 |           76.1 |                  21.0 |            11 |          20.8 |
| Original                       | 1000 |    4110.9 |         64000 |          347.9 |                  26.6 |            12 |          51.0 |
| Virtualized before UI redesign |  200 |     108.7 |           455 |           31.9 |                  19.4 |             0 |          13.3 |
| Virtualized before UI redesign | 1000 |     165.0 |           455 |           31.9 |                  18.8 |             0 |          13.3 |
| Final minimal UI               |  200 |      78.6 |           420 |           32.0 |                  17.0 |             0 |          13.3 |
| Final minimal UI               | 1000 |     147.3 |           420 |           32.2 |                  19.4 |             0 |          13.4 |

The final 1,000-row load is about 28× faster than the original; selection is about 11× faster. The UI redesign retains the virtualization gains. Smaller differences between optimized builds can reflect run variance and different grid widths (1,664 px before redesign; 1,612 px in the final UI), rather than a new optimization.

This measures the production renderer in isolated headless Chrome, with database and IPC latency excluded. Input timing waits for two animation frames, imposing roughly a 32 ms floor at 60 Hz. These scroll results are not native Electron GPU FPS. The 1,000-row load includes opening the initial 200-row page and changing page size. No recording or concurrent tests ran during measurement.

Raw samples and renderer hashes are committed in [performance-results.json](performance-results.json). They were captured before the UI commit, so their Git revision points to the preceding performance commit; the renderer hashes identify the tested builds. Reproduction commands and harness details are in [README.md](README.md#performance-comparison).

Validation: TypeScript, production build, all 30 unit/regression tests, UI smoke checks, formatting and diff whitespace checks passed. The UI smoke run covers SQL clipboard/dismissal/focus, column search, visibility/pinning/reset, unchanged grid height, editing/history, navigation and both themes.
