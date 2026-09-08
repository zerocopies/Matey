# Stage 3.5 — Oscillation Detection & Fix Memory: Test Results

**Date:** 2026-08-30  
**Device:** Pixel 8a (Android 17)  
**App:** com.matey.app (build lastUpdateTime: 2026-08-30 03:19:23)

---

## Test 1: Fix Memory — Record + Read

**Method:** CDP Runtime.evaluate via WebView DevTools Protocol

**Steps:**
1. Opened IndexedDB "matey-fix-memory"
2. Recorded fix: `write_file:permanent:not_found` → "Changed filePath from CamelCase to lowercase"
3. Read back the entry

**Result:** ✅ PASS
```
✅ Fix recorded: write_file:permanent:not_found → Changed filePath
✅ Fix lookup: Changed filePath from /bad/test.txt to test.txt
   HINT: Note: the error was fixed by: Changed filePath from /bad/test.txt to test.txt
```

---

## Test 2: Oscillation Detection

**Method:** CDP Runtime.evaluate via WebView DevTools Protocol

**Scenario:**
- Step 1: write_file FAILED (not_found)
- Step 2: list_files SUCCEEDED (different tool breaks consecutiveness)
- Step 3: write_file FAILED AGAIN with SAME signature

**Old Stage 3 behavior:** Would NOT detect this (only checks consecutive same-tool failures)

**New Stage 3.5 behavior:** ✅ PASS
```
Step 1: write_file FAILED
Step 2: list_files SUCCEEDED (different tool!)
Step 3: write_file FAILED AGAIN with SAME signature
Tools between failures: [list_files]
✅ OSCILLATION DETECTED — nudge should fire

✅ ALL INLINE TESTS PASSED
```

---

## Test 3: Force-Stop/Relaunch Persistence

**Method:** CDP + adb shell

**Steps:**
1. Record fix to IndexedDB: `write_file:permanent:not_found` → "Changed filePath from CamelCase to lowercase"
2. Force-stop app: `adb shell am force-stop com.matey.app` (process killed, PID 30871 → dead)
3. Relaunch app: `adb shell am start -n com.matey.app/.MainActivity` (new PID 31381)
4. Read back from IndexedDB

**Result:** ✅ PASS — all fields intact
```json
{
  "id": "persist-test::write_file:permanent:not_found",
  "workspace": "persist-test",
  "signature": "write_file:permanent:not_found",
  "whatFixed": "Changed filePath from CamelCase to lowercase",
  "fixedAt": 1788045715620
}
```

---

## Implementation Summary

**Files modified:**
- `public/matey-agent.js` — Added FixMemory class (90 lines), oscillation detection (37 lines), fix recording on success (18 lines), fix hint injection before LLM calls (15 lines)

**Exports added:** `FixMemory` (alongside existing exports)

**Key behaviors:**
1. Error signatures normalized as `tool:code:reason` (lowercased)
2. Oscillation: same signature reappears after a DIFFERENT tool ran → strong nudge to stop
3. Fix memory: error → later success with different args → fix recorded to IndexedDB
4. Fix hint: before next LLM call after failure, check IndexedDB → inject hint if found
5. All data scoped per workspace via `MateyFS.getCurrentWorkspace()`

---

## Test Files Created
- `public/test-stage35.html` — Oscillation + Fix Memory verification page
- `public/test-persist.html` — Force-stop/relaunch persistence verification page
