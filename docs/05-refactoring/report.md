# Refactor and optimization report

This report records a measured refactor of the AI Sales Manager codebase. Suggestions came from a static review. Each suggestion was accepted only when an existing test, or a new test written before the change was trusted, could show the behavior stayed the same. Suggestions that would rewrite a core pipeline without that safety net were rejected and are listed below.

The pull request is the review artifact. A second reader should check the two places called out at the end: the SSRF address table, and the calendar-day boundary of the operator chart.

## Method

All numbers below were taken on the same machine, against the same checkout, before the edits and again after them.

| Metric                | How it was measured                                                                                                                                                                                                                                                                                                                      |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cyclomatic complexity | `node scripts/complexity.mjs apps/api/src apps/web/src packages/shared/src`. McCabe-style count on the TypeScript AST. A function starts at 1. Each `if`, `for`, `for-in`, `for-of`, `while`, `do`, `case`, `catch`, `?:`, `&&`, and `\|\|` adds 1. `else` does not. Nested functions are counted on their own. Spec files are excluded. |
| Lint                  | `pnpm exec oxlint` on `apps/api/src`, `apps/web/src`, and `packages/shared/src`. The count is the number of errors oxlint prints.                                                                                                                                                                                                        |
| Test coverage         | Jest with `json-summary`, limited to the files this change touches. This is not a whole-repository coverage figure. Commands are in the coverage section.                                                                                                                                                                                |
| Latency and memory    | `node scripts/bench-overview-series.mjs <api env file>`. Forty iterations of the operator chart query, first five discarded. Reports p50, p95, JSON payload bytes, and mean `process.memoryUsage().heapUsed` delta. The database held 116 message and AI-usage rows in the 14-day window. Time zone during the run: `Africa/Casablanca`. |

## Before

| Metric            | Value                             |
| ----------------- | --------------------------------- |
| Files scanned     | 330                               |
| Functions         | 2,576                             |
| Total complexity  | 8,750                             |
| Mean complexity   | 3.40                              |
| Maximum           | 65 (`PlaygroundService.simulate`) |
| Functions over 10 | 166                               |
| Functions over 20 | 43                                |
| oxlint errors     | 7                                 |

The two functions this change was allowed to touch, because tests already pinned their behavior:

| Function                        | Complexity before |
| ------------------------------- | ----------------- |
| `classifyDeterministicFallback` | 53                |
| `isPrivateOrReservedIp`         | 43                |

Coverage of those files, same Jest suites, before any edit:

| File                               | Lines            | Statements       | Branches        | Functions    |
| ---------------------------------- | ---------------- | ---------------- | --------------- | ------------ |
| `llm-intent-classifier.service.ts` | 42.85% (36/84)   | 41.30% (38/92)   | 68.08% (64/94)  | 75.00% (3/4) |
| `media.service.ts`                 | 80.62% (129/160) | 77.22% (139/180) | 68.33% (82/120) | 88.88% (8/9) |
| `platform-series.ts`               | did not exist    |                  |                 |              |

The operator overview loaded every `messages.created_at` and `ai_usage.created_at` for 14 days into Node and bucketed them in JavaScript.

| Series query  | Rows | Payload     | p50     | p95     | Mean heap delta |
| ------------- | ---- | ----------- | ------- | ------- | --------------- |
| Two row scans | 116  | 4,874 bytes | 1.06 ms | 1.43 ms | −45,050 bytes   |

The heap delta is negative because garbage collection ran during the sample. It is not a memory measurement. The payload size is the memory figure that is stable on this dataset.

## What was accepted

### 1. Intent fallback, data instead of an else-if chain

`classifyDeterministicFallback` was a chain of `includes` checks. The phrases, the order, and the two secondary-intent rules are now a table. The first matching rule wins, which is the same control flow as `else if`.

Complexity of that method: **53 → 1**. The matcher that walks the table is complexity 5.

Checked with the existing hybrid classifier suite, provider keys unset so the suite stays offline: **146 tests passed**, including the 102-sample golden set at 100% intent accuracy across Arabizi, Arabic script, French, and mixed language.

### 2. SSRF address checks, one predicate per range

`isPrivateOrReservedIp` mixed parsing with eleven IPv4 ranges and the IPv6 cases. Each IPv4 range is now its own predicate. Hostname blocking uses a set and a suffix list. The ranges themselves are unchanged, including the existing `fe80::/10` prefix approximation (`fe8`, `fe9`, `fea`, `feb`).

Complexity of `isPrivateOrReservedIp`: **43 → 2**. `isBlockedHostname` is 4.

The existing media suite still passes. A new test calls the helper directly for every range in the table, for the public addresses that must stay allowed (`8.8.8.8`, `1.1.1.1`, and the edges of 172.16/12 and 100.64/10), and for blocked host suffixes.

### 3. Operator chart, grouped by local day

The overview no longer ships every timestamp. Postgres counts rows per calendar day with `to_char(created_at AT TIME ZONE <node zone>, 'YYYY-MM-DD')`. The table name is not interpolated: `messages` and `ai_usage` are two separate queries selected by a fixed key. Empty days are still filled in `fillDailySeries`, which is covered by a unit test that injects the clock.

| Series query       | Rows | Payload   | p50     | p95     | Mean heap delta |
| ------------------ | ---- | --------- | ------- | ------- | --------------- |
| Two grouped counts | 6    | 194 bytes | 0.75 ms | 0.88 ms | −19,810 bytes   |

On this 116-row window that is a 29% lower p50, a 38% lower p95, and a payload about 25 times smaller (4,874 → 194 bytes). Heap deltas are still inside garbage-collection noise, so this report does not claim a process-memory reduction. The payload is what the API retains per refresh, and that cost now grows with the number of days, not the number of messages.

### 4. Lint fixes that do not change product behavior

Six of the seven oxlint errors were real and safe:

| Location                    | Rule                            | Change                                                                                           |
| --------------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `website-install-panel.tsx` | `react/set-state-in-effect`     | Read `window.location.origin` with `useSyncExternalStore` instead of setting state in an effect. |
| `website-install-panel.tsx` | `react/set-state-in-effect`     | Clear the load error in the request callback, not synchronously inside the effect.               |
| `step-store-setup.tsx`      | `react/immutability`            | Move the active-business cookie write to `lib/active-business.ts`.                               |
| `command-palette.tsx`       | `react/set-state-in-effect`     | Reset the query in the dialog close handler.                                                     |
| `command-palette.tsx`       | `jsx-a11y/no-autofocus`         | Focus the input from a ref when the dialog opens.                                                |
| `operator/page.tsx`         | `jsx-a11y/prefer-tag-over-role` | Drop `role="img"` from the chart `<svg>` and keep the accessible name on `aria-label`.           |

## What was rejected

| Suggestion                                                                                                                      | Why it was not applied                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Replace the inbox attachment `<img>` with `next/image`                                                                          | The image is a blob URL from an authenticated download. `next/image` does not fit that source. The lint gate still has to be clean, so the line carries an oxlint exception that states this reason. It is not counted as a fix. |
| Split `PlaygroundService.simulate` (complexity 65), `evaluateTriggers` (56), `runInTransaction` (50), or `runTurnPipeline` (47) | These are the order and AI pipelines. Extracting them without a characterization test would be a behavior risk, not a cleanup. The maximum complexity stays 65 on purpose.                                                       |
| Switch the chart to `date_trunc` in the database session time zone                                                              | That can place a message on a different day than the previous local-time bucketing. The accepted query converts to the Node process time zone first.                                                                             |

## After

| Metric            | Before | After |
| ----------------- | ------ | ----- |
| Files scanned     | 330    | 332   |
| Functions         | 2,576  | 2,604 |
| Total complexity  | 8,750  | 8,697 |
| Mean complexity   | 3.40   | 3.34  |
| Maximum           | 65     | 65    |
| Functions over 10 | 166    | 163   |
| Functions over 20 | 43     | 41    |
| oxlint errors     | 7      | 0     |

Six errors were removed by changing the code. The seventh, `next/no-img-element` on the inbox attachment, is not a product fix: the image is a blob URL from an authenticated download, and `next/image` cannot load it. A one-line oxlint exception records that reason so the repository lint gate is clean. That exception is not counted in the six fixes.

Function count rose because the two long functions were split into small ones. Total complexity still fell by 53, and two functions left the "over 20" band: the fallback classifier and the SSRF check.

Coverage after the same suites, plus the new tests. Provider keys were unset.

| File                               | Lines            | Statements       | Branches       | Functions      |
| ---------------------------------- | ---------------- | ---------------- | -------------- | -------------- |
| `llm-intent-classifier.service.ts` | 54.16% (26/48)   | 51.72% (30/58)   | 36.36% (8/22)  | 85.71% (6/7)   |
| `media.service.ts`                 | 85.88% (140/163) | 86.74% (157/181) | 88.09% (74/84) | 96.29% (26/27) |
| `platform-series.ts`               | 100% (18/18)     | 100% (19/19)     | 80% (4/5)      | 100% (4/4)     |

Read the classifier branch percentage carefully. It fell because the phrase checks are data now, not branches. The file also has fewer lines (84 → 48), and the live model call is still uncovered: that path was not rewritten. The golden set remains the behavior check, and it is still 100%.

Touched suites after the change: **177 tests passed** (146 classifier, 28 media, 3 series).

The pre-commit audit scans every web file, not only the diff. It rejected raw hex and non-standard radii that were already on the sample storefront, the chat widget, and the operator cards. Those classes now use `bg-muted`, `text-foreground`, `text-muted-foreground`, `bg-secondary`, and `rounded-lg`. The layout is unchanged.

## What a reviewer should double-check

1. **SSRF table.** Compare `IPV4_RESERVED` and the IPv6 prefix list with the previous condition order. The new direct test is the checklist. Confirm a public address such as `8.8.8.8` is still allowed and `169.254.169.254` is still blocked.
2. **Chart day boundary.** The grouped query uses `Intl.DateTimeFormat().resolvedOptions().timeZone`. On the measurement machine that was `Africa/Casablanca`. Confirm the API process zone is the zone the chart should display, and that Postgres has that zone name.
3. **Do not treat the heap deltas as a win.** Both samples moved with the garbage collector. The memory claim in this report is the payload: 4,874 bytes down to 194 bytes per refresh on the current dataset.

The API typecheck also fails on this checkout because `@ai-sdk/provider` is installed twice (4.0.7 and 4.0.29). `getLanguageModel` and `getEmbeddingModel` now assert the compat-provider result to the type the rest of the file already uses. That is a compile-time alignment, not a behavior change.

The full API suite, which the commit hook runs, had two failures that were already in the tree. The gateway test still expected the error text from before Groq and Orca were added. The human-reply test did not stub `channelAccount.findFirst`, which the send path calls outside production. Both expectations now match the code.
