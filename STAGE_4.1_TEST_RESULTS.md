# Stage 4.1 — Parallel Tool-Call Execution: Test Results

**Date:** 2026-08-30
**Device:** Pixel 8a (Android 17)
**App:** com.matey.app

---

## Audit: Dependency Analysis

**Question:** Can calls in a single LLM response's `tool_calls` array be dependent?

**Answer:** No. The LLM emits all tool calls in one batch atomically — it does not see results
of any call before producing subsequent calls in the same array. Therefore all calls within
one batch are always logically independent.

**Physical conflict:** Two calls writing to the same `filePath` could race. The grouping logic
serializes calls targeting the same filePath while parallelizing calls to different paths.

---

## Implementation

**Before (serial for-loop):**
```js
for (const call of choice.tool_calls) {
  const args = JSON.parse(call.function.arguments);
  const result = await this.dispatcher.dispatch(call.function.name, args);
  // ... process result ...
}
```

**After (grouped parallel):**
```js
// 1. Group by filePath
// 2. Same-path calls: sequential. Different-path calls: Promise.all()
// 3. Process results in order, pushing to conversationHistory
// 4. Log batch completion time
```

---

## Timing (Simulated 3 x 100ms tool calls)

| Method | Wall time | Speedup |
|---|---|---|
| Sequential (old) | 304ms | 1x |
| Parallel (new) | 102ms | ~3x |

On real file system operations (which often involve 50-500ms I/O), the speedup scales
linearly with the number of independent calls in the batch.

---

## Grouping Logic Verified

Input: `[read_file(a.txt), read_file(b.txt), read_file(a.txt)]`
Output: `[{path:"a.txt", calls:["read_file","read_file"]}, {path:"b.txt", calls:["read_file"]}]`

Calls to `a.txt` serialize. Calls to `b.txt` run in parallel with the `a.txt` group.

---

## Files Modified
- `public/matey-agent.js` — replaced sequential for-of loop with grouped parallel execution
