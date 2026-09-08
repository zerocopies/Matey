# Matey Universal Speech Engine (MateySpeech) — Implementation Documentation

## Overview

This document describes all changes made to integrate the `matey-stt.js` specification (located at `/home/prp/Documents/matey-stt.js`) into the Matey app. The integration adds a **domain-aware universal speech recognition engine** that supports 7 domains: **Culinary, Wardrobe, Grooming, Living, Journal, Editor, and Agent**.

The engine is future-proofed: any future UI microphone button can hook into `window.MateySpeech` without modifying core speech logic.

---

## 1. New File: `app/public/matey-stt.js`

**Status:** CREATED

A complete IIFE-wrapped (Immediately Invoked Function Expression) version of the ES module specification from `/home/prp/Documents/matey-stt.js`. Since the Matey app uses plain `<script>` tags (not ES modules), the code was converted from `export class` syntax to browser-global IIFE syntax that binds to `window.MateySpeech`.

### What was added (component by component):

### 1.1 `STT_DOMAINS` (lines ~30-40)

| Constant | Value | Purpose |
|---|---|---|
| `CULINARY` | `'culinary'` | Cooking & recipe dictation |
| `WARDROBE` | `'wardrobe'` | Fashion, clothing, outfit descriptions |
| `GROOMING` | `'grooming'` | Personal care, skincare, hygiene routines |
| `LIVING` | `'living'` | Home, household, smart home commands |
| `JOURNAL` | `'journal'` | Personal journaling, daily notes |
| `EDITOR` | `'editor'` | Code editor dictation (identifiers, syntax) |
| `AGENT` | `'agent'` | AI assistant commands (@file, search, etc.) |

**New addition vs. spec:** `WARDROBE` and `GROOMING` are registered in the domains object even though dedicated HTML pages don't exist yet. The engine is ready for them.

### 1.2 `STT_MODEL_CATALOG` (lines ~42-78)

Four models registered:

| Model ID | Name | Type | Size | Recommended |
|---|---|---|---|---|
| `silero-vad` | Silero VAD (Silence & Noise Filter) | vad | 2MB | Yes |
| `distil-whisper-small` | Distil-Whisper Small (INT8 ONNX) | stt | 150MB | Yes |
| `whisper-large-v3-turbo` | Whisper Large v3 Turbo (ONNX) | stt | 808MB | No |
| `moonshine-base` | Moonshine Base (Ultra-Light Edge) | stt | 110MB | No |

Each model has: `name`, `type`, `sizeMB`, `recommended`, `description`, `downloadUrl`.

### 1.3 `ModelStorageManager` (lines ~82-125)

IndexedDB-based model weight storage with methods:
- `openDB()` — Opens/creates `MateyVoiceDB` with an `models` object store
- `saveModel(modelId, arrayBuffer)` — Stores model weights in IndexedDB
- `getModel(modelId)` — Retrieves model weights from IndexedDB
- `deleteModel(modelId)` — **NEW ADDITION** (not in original spec): Allows uninstalling models

### 1.4 `DirectDownloader` (lines ~129-158)

Fetches model weights from HuggingFace with:
- Content-length based progress reporting via `onProgress` callback
- Streams download chunks
- Saves to `ModelStorageManager` after download completes

### 1.5 `ContextConditioner` (lines ~163-200)

Domain-specific Whisper initial prompts. Each domain gets curated keyword lists:

| Domain | Keyword Examples |
|---|---|
| GROOMING | haircut, beard trim, skincare, moisturizer, SPF, serum, cleanser, cologne, shave, hygiene, routine |
| WARDROBE | cotton, denim, jacket, sneakers, shirt, trousers, size, fit, casual, formal, laundry, outfit |
| CULINARY | ingredients, grams, ml, tablespoons, teaspoons, bake, sauté, simmer, preheat |
| LIVING | inventory, restock, pantry, room, schedule, clean, maintenance, smart home |
| JOURNAL | natural spoken prose, punctuated sentences, daily thoughts, mood notes |
| EDITOR | async, await, const, let, function, return, import, export, JSON |
| AGENT | @file, search, replace, fix bug, refactor, list directory, run task |

**New additions vs. spec:** Expanded keyword lists with additional terms (e.g., hair, face, body, shampoo for Grooming; suit, jeans, coat, boots for Wardrobe; oven, pan, pot, recipe for Culinary).

### 1.6 `MultiDomainPostProcessor` (lines ~205-270)

Post-processes raw Whisper transcription per domain:

| Domain | Processing Rules |
|---|---|
| GROOMING | `spf 50` → `SPF 50`, `spf fifty` → `SPF 50`, `milliliters` → `ml`, `ounces` → `oz`, `every 3 weeks` normalization |
| CULINARY | `grams` → `g`, `kilograms` → `kg`, `tablespoons` → `tbsp`, `teaspoons` → `tsp`, `degrees celsius` → `°C`, `degrees fahrenheit` → `°F` |
| EDITOR/AGENT | `open parenthesis` → `(`, `close bracket` → `]`, `dot js` → `.js`, `equals equals equals` → `===`, `semi colon` → `;`, `camel case` conversion |
| WARDROBE | **NEW ADDITION** (not in original spec): Size normalization (`size m` → `size M`), capitalization of size words |
| LIVING | **NEW ADDITION** (not in original spec): Quantity formatting (`3 x` → `3x`), unit normalization (`liters` → `L`) |
| JOURNAL | Capitalize first letter, add period if missing |
| Default | Trim whitespace only |

### 1.7 `SileroVADProcessor` (lines ~274-296)

Voice Activity Detection — filters silence before transcription:
- 512-sample frames
- RMS threshold of 0.012
- Removes low-energy (silence) frames

### 1.8 `UniversalSpeechService` (lines ~300-410)

The main service class bound to `window.MateySpeech`. Key methods:

| Method | Parameters | Returns | Notes |
|---|---|---|---|
| `startListening()` | none | Promise | Requests mic, starts MediaRecorder |
| `stopListening(domain, contextPayload)` | domain (string), contextPayload (object) | Promise<string> | Full pipeline: VAD → ContextConditioner → ModelStorage → Whisper → PostProcessor |
| `processAudioBlob(blob, domain, contextPayload)` | blob, domain, contextPayload | Promise<string> | Internal: routes to MateyWhisper if loaded |
| `fallbackTranscribe(pcm, domain)` | pcm data, domain | Promise<string> | Fallback when MateyWhisper unavailable |
| `setActiveModel(modelId)` | modelId | void | Sets active STT model, persists to localStorage |
| `getCatalog()` | none | array | Returns STT_MODEL_CATALOG |
| `isModelDownloaded(modelId)` | modelId | boolean | Checks localStorage for downloaded models |
| `markDownloaded(modelId)` | modelId | void | Marks model as downloaded in localStorage |
| `downloadModel(modelId, onProgress)` | modelId, progress callback | Promise | Downloads via DirectDownloader, tracks in localStorage |
| `onStateChange(callback)` | callback | unsubscribe function | Observer pattern for recording state changes |

**Key design decision:** The `stopListening` method accepts a `domain` parameter and `contextPayload` object. This means any future mic button only needs to call `window.MateySpeech.stopListening('grooming', { routineType: 'Night Skincare' })` — no core STT logic changes needed.

**New additions vs. spec:**
- Added `setActiveModel()`, `getCatalog()`, `isModelDownloaded()`, `markDownloaded()`, `downloadModel()` — for integration with the Voice Models screen
- Added `onStateChange()` observer pattern for UI updates
- Added `applyVAD` flag for runtime VAD toggle
- Added `fallbackTranscribe()` for when MateyWhisper is not loaded
- Added IndexedDB-based `ModelStorageManager.deleteModel()`
- The `runInference` stub returns domain-specific placeholder text (matching spec's Grooming example)

### 1.9 Global Binding

At the bottom of `matey-stt.js`:
```javascript
if (typeof window !== 'undefined') {
  window.MateySpeech = new UniversalSpeechService();
  window.MateySpeech.STT_DOMAINS = STT_DOMAINS;
  window.MateySpeech.STT_MODEL_CATALOG = STT_MODEL_CATALOG;
  window.MateySpeech.ModelStorageManager = ModelStorageManager;
  window.MateySpeech.DirectDownloader = DirectDownloader;
  window.MateySpeech.ContextConditioner = ContextConditioner;
  window.MateySpeech.MultiDomainPostProcessor = MultiDomainPostProcessor;
  window.MateySpeech.SileroVADProcessor = SileroVADProcessor;
}
```

All sub-components are exposed as static properties on `window.MateySpeech` for direct access.

---

## 2. Modified File: `app/public/matey-mic.js`

**Status:** MODIFIED

The existing mic handler (`matey-mic.js`) was updated to integrate with the new `MateySpeech` universal speech service while maintaining backward compatibility with `MateyWhisper`.

### 2.1 New constant: `STT_DOMAINS_DEFAULT`

```javascript
var STT_DOMAINS_DEFAULT = 'journal';
```

Default domain for transcription when no explicit domain is set.

### 2.2 New function: `insertTextAtCursor(inputEl, text)`

Extracted from the inline `doTranscribe` function. Inserts text at the cursor position in an input element:
- Gets current selection start/end
- Inserts text at cursor position
- Dispatches `input` event for React/form binding
- Resets cursor position after inserted text

### 2.3 Modified: `processAudioBlob(blob, domain, contextPayload)`

**Before:** Called `processAudioBlob(blob)` with no domain awareness. Always used `MateyWhisper.transcribe()`.

**After:** 
1. Accepts `domain` and `contextPayload` parameters (with defaults)
2. **If `MateySpeech` is available:** Delegates to `MateySpeech.stopListening(domain, contextPayload)` which uses the full domain-aware pipeline (VAD + ContextConditioner + Whisper + PostProcessor)
3. **Falls back to `MateyWhisper`:** If `MateySpeech` is not available, uses the original Whisper-based path

### 2.4 Modified: `mediaRecorder.onstop` handler

**Before:** Called `processAudioBlob(blob)` with no domain context.

**After:** Reads `micState.currentDomain` and `micState.currentContextPayload` and passes them to `processAudioBlob(blob, domain, contextPayload)`.

### 2.5 Modified: `doTranscribe(blob, input)` 

Simplified to use the new `insertTextAtCursor()` helper function instead of inline text insertion logic (removed ~25 lines of duplicated cursor positioning code).

### 2.6 Modified: `MateyMic` public API

New methods added to `window.MateyMic`:

| Method | Parameters | Description |
|---|---|---|
| `setDomain(domain, contextPayload)` | string, object | Sets the current STT domain and context payload |
| `setDomainFromInput(inputEl)` | DOM element | Auto-detects domain from input element ID (e.g., `journal-content-input` → `journal`, `md-editor` → `editor`, `md-compose-input` → `agent`) |
| `STT_DOMAINS` | — | Exposes the domain constants (CULINARY, WARDROBE, GROOMING, LIVING, JOURNAL, EDITOR, AGENT) |

Modified `getState()`:
- **Before:** Returned `{ active, modelId }` from `MateyWhisper`
- **After:** Returns `{ active, modelId, domain }` — pulls `activeModelId` from `MateySpeech` if available, falls back to `MateyWhisper`

Modified `onStateChange` callback:
- **Before:** Notified listeners with `{ active, modelId }`
- **After:** Also passes domain information via `notifyStateChange()`

---

## 3. Modified File: `app/public/matey-voice-models.js`

**Status:** MODIFIED

The Voice Models management screen was updated to include `MateySpeech` STT models alongside existing Whisper models.

### 3.1 New function: `buildSttModels()`

Dynamically builds the combined STT model catalog from two sources:
1. **Whisper models** (if `window.MateyWhisper.getModelOptions()` exists) — existing models from `matey-whisper.js`
2. **MateySpeech models** (if `window.MateySpeech.STT_MODEL_CATALOG` exists) — the 4 new models: silero-vad, distil-whisper-small, whisper-large-v3-turbo, moonshine-base

Each model is tagged with a `group` property:
- `'whisper'` for Whisper models
- `'matey-speech'` for MateySpeech STT models  
- `'silero'` for Silero VAD model

### 3.2 Modified: `STT_MODELS` array initialization

**Before:** Hardcoded array of 6 Whisper models.

**After:** Empty array initialized as `var STT_MODELS = []`, populated dynamically by `buildSttModels()`.

### 3.3 Modified: `getModelsForTab(tab)`

**Before:** Simply returned `STT_MODELS` (the hardcoded array).

**After:** Calls `buildSttModels()` if the array is empty, then returns it. This ensures the catalog is rebuilt at query time so all available models are included.

### 3.4 Modified: `downloadModel(modelId, tab)`

**Before:** Only handled Whisper models via `MateyWhisper.loadModel()`. Fallback simulated progress for all other models.

**After:** Three-tier strategy:
1. **Whisper models** (`group === 'whisper'`): Uses `MateyWhisper.loadModel(modelId, onProgress)` — existing behavior
2. **MateySpeech models** (silero-vad, distil-whisper-small, etc.): Uses `MateySpeech.downloadModel(modelId, onProgress)` — real download with progress reporting via `DirectDownloader`
3. **Fallback** (TTS models): Simulated progress interval — for models not yet bundled

### 3.5 Modified: `renderModelCard(model, tab)`

The `model-size` field now displays `model.size` which could be a string like `"150MB"` (MateySpeech) or `"99MB"` (Whisper). The `model-card-type` now shows "STT" for all speech models and "TTS" for text-to-speech models.

---

## 4. Modified File: `app/public/preview.html` (Agent page)

**Status:** MODIFIED

### 4.1 `md-voice` button handler

**Before:** When `SpeechRecognition` API was unavailable, the `md-voice` button was hidden (`voiceBtn.style.display = 'none'`).

**After:** 
- If `SpeechRecognition` is available → uses native Web Speech API (unchanged)
- **If `MateySpeech` is available** → uses `MateySpeech.startListening()` / `MateySpeech.stopListening('agent', { fileName: 'preview.js' })` for domain-aware transcription
- **If neither is available** → hides the button (fallback)

The `md-voice` button now inserts transcribed text with code-editor post-processing (parentheses, brackets, camelCase conversion) thanks to the AGENT domain processor.

---

## 5. Modified Files: All HTML pages with mic support

**Status:** MODIFIED

The following 9 HTML files were updated to include `<script src="./matey-stt.js?v=100">` after `matey-whisper.js` and before `matey-mic.js`:

| File | Purpose |
|---|---|
| `index.html` | Main dashboard/home |
| `preview.html` | Agent/chat preview |
| `journal.html` | Journal entry page |
| `markdown.html` | Markdown editor |
| `lifestyle.html` | Lifestyle/living page |
| `beat.html` | Beat/music page |
| `hooks.html` | Hooks management page |
| `vots.html` | VOTS (Vault, Outbox, Tasks, Search) page |
| `voice-models.html` | Voice model management screen |

### 5.1 Script loading order (corrected in `vots.html`)

**Before (vots.html only):** `matey-mic.js` was loaded before `matey-whisper.js`/`matey-stt.js`, meaning `MateyMic.init()` ran before `MateySpeech` was available.

**After:** Script order corrected to: `matey-whisper.js` → `matey-stt.js` → `matey-mic.js` on all pages.

---

## 6. Build & APK

**Status:** COMPLETED

### 6.1 Build process

```
dist/ rebuilt from public/
npx cap sync android
./gradlew assembleDebug
```

### 6.2 Output APK

- **Path:** `/home/prp/Documents/Matey/app/build/matey-voice-stt.apk`
- **Size:** ~165 MB
- **Also available at:** `/home/prp/Documents/Matey/app/android/app/build/outputs/apk/debug/app-debug.apk`
- **Device connected:** No device was connected during build, so automatic `adb install` was not possible. APK is ready for manual installation.

### 6.3 Android assets verification

`matey-stt.js` verified present at:
- `/home/prp/Documents/Matey/app/android/app/src/main/assets/public/matey-stt.js`
- All updated HTML files verified at `/home/prp/Documents/Matey/app/android/app/src/main/assets/public/`

---

## 7. Architecture Summary

### Data flow (recording → transcription):

```
[Mic Button Click]
       ↓
MateyMic.startRecording() or MateySpeech.startListening()
       ↓
MediaRecorder captures audio chunks
       ↓
[Mic Button Click — Stop]
       ↓
MateyMic.stopRecording()
       ↓
mediaRecorder.onstop → processAudioBlob(blob, domain, contextPayload)
       ↓
    ┌─MateySpeech available?─ YES ─→ MateySpeech.stopListening(domain, payload)
    │                                    ↓
    │                              SileroVADProcessor.filterSilence()
    │                                    ↓
    │                              ContextConditioner.generatePrompt(domain)
    │                                    ↓
    │                              ModelStorageManager.getModel()
    │                                    ↓
    │                              MateyWhisper.transcribe(blob) [or fallback]
    │                                    ↓
    │                              MultiDomainPostProcessor.process(text, domain)
    │                                    ↓
    │                              insertTextAtCursor(input, finalText)
    ↓
    └─ NO ─→ MateyWhisper.transcribe(blob) [legacy path, direct Whisper]
```

### Domain auto-detection (`matey-mic.js` → `setDomainFromInput`):

| Input ID pattern | Detected Domain |
|---|---|
| `journal-content-input`, `journal-title-input` | `journal` |
| `md-compose-input`, `md-voice` | `agent` |
| `md-editor` | `editor` |
| `vots-content-input` | `agent` |
| `recipe-ingredients` | `culinary` |
| `grooming-*-input` | `grooming` (future) |
| `wardrobe-*-input` | `wardrobe` (future) |
| Default | `journal` |

---

## 8. Known Limitations & Future Work

1. **Silero VAD is stubbed** — `applyVAD` is currently `false` (VAD processing exists but is bypassed). Enable by setting `MateySpeech.applyVAD = true`.
2. **`Moonshine` and `Whisper Large v3 Turbo` models** are registered in the catalog but their actual ONNX runtime inference is not implemented. The `runInference` method uses the Whisper pipeline via `MateyWhisper`.
3. **Grooming and Wardrobe UI pages** don't exist yet. The engine is ready — just add `<script src="./matey-stt.js">` and a mic button calling `MateySpeech.startListening()` / `MateySpeech.stopListening('grooming', { routineType: '...' })`.
4. **`ModelStorageManager`** stores weights in IndexedDB but the current build relies on `MateyWhisper` for actual model loading. Direct ONNX model loading (for distil-whisper-small, etc.) requires an ONNX runtime (not bundled in the current app).
5. **No device was connected** during the APK build. The APK file is ready for manual installation.

---

## 9. File Change Summary

| File | Action | Lines Changed |
|---|---|---|
| `app/public/matey-stt.js` | **NEW** | ~410 lines (IIFE with 9 components) |
| `app/public/matey-mic.js` | Modified | +~50 lines (domain awareness, insertTextAtCursor helper, STT_DOMAINS export, setDomain/setDomainFromInput) |
| `app/public/matey-voice-models.js` | Modified | +~40 lines (buildSttModels, downloadModel routing, script tag additions in all HTML) |
| `app/public/preview.html` | Modified | +~15 lines (MateySpeech fallback for md-voice button) |
| `app/public/index.html` | Modified | +1 line (matey-stt.js script tag) |
| `app/public/journal.html` | Modified | +1 line (matey-stt.js script tag) |
| `app/public/markdown.html` | Modified | +1 line (matey-stt.js script tag) |
| `app/public/preview.html` | Modified | +1 line (matey-stt.js script tag) |
| `app/public/lifestyle.html` | Modified | +1 line (matey-stt.js script tag) |
| `app/public/beat.html` | Modified | +1 line (matey-stt.js script tag) |
| `app/public/hooks.html` | Modified | +1 line (matey-stt.js script tag) |
| `app/public/vots.html` | Modified | +1 line (matey-stt.js script tag) + reordered script loading |
| `app/public/voice-models.html` | Modified | +1 line (matey-stt.js script tag) |
| `app/build/matey-voice-stt.apk` | **NEW** | Generated APK |
