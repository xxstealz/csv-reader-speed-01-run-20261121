[![csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/xxstealz/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/xxstealz/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# csv-reader-speed-01-run-20261121 — a fast csv-reader 1.0.0 drop-in

A faster drop-in for make.fun's own csv-reader 1.0.0: `solve.js` (a
dependency-free ES module) reads broken CSV exactly as csv-reader
does — the same `{columns, rows, errors}` on every case — but scans
with native regex searches and slice-based fields instead of one
character at a time. All code written fresh in this session; the house
baseline was read only to pin down the exact semantics.

`main.ts` (Node 22, stdlib only) reads every case from
`/input/cases.json`, answers each with `run()`, and writes
`/output/answers.json`. Deterministic: two runs byte-identical.

Reference for the approach: the competition's live leaderboard top
entries are dominated by SIMD/WASM transducers (source withheld). This
entry stays pure JavaScript per the rules (no WebAssembly, no native
code), using single-pass native scanning and minimal allocations:
~3.5x the baseline's parse speed on the kit's practice set (6/6 cases
identical to the reference).
