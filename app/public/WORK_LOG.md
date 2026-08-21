# Matey App — Work Log & Restart Guide

## Project Root
**Working Directory:** `/home/prp/Documents/Matey/app/public/`

All web assets (HTML, JS, CSS) are in this directory. The Android APK is built by injecting these files into the original `matey.apk` and deploying to the device via wireless ADB at `192.168.10.131:35787`.

---

## Completed Work

### 1. Spatial Room Restyler — Fixed & Restructured
- **Fixed:** Room tab was not opening due to missing `room` in `matey-tabs.js` `TAB_ORDER` and incorrect provider key references in `matey-room.js`
- **Moved:** Room Restyler removed from top-level navigation tab and placed as a subsection inside the **Lifestyle** modal
- **Updated:** Now requires **4 specific photos**:
  1. Entrance View — stand at entrance, face inside
  2. Far-End View — walk to opposite end, face back toward entrance
  3. Left Side View — stand in middle, photo of left side
  4. Right Side View — photo of right side
- **AI Behavior:** Infers room type from photos. Asks clarifying questions only if room appears empty. Returns single best layout with 3–4 move instructions and rationale
- **Files:** `matey-tabs.js`, `matey-room.js`, `room.html`

### 2. Custom Tab — Restored
- **Restored:** Custom tab added back to top-level navigation (`./preview.html#custom`)
- **Files:** `matey-tabs.js`, `starring.html`

### 3. Lifestyle Vertical Integration (Grooming, Wardrobe, Culinary, Beat)
- **Created:** `matey-lifestyle.js` — unified lifestyle hub with 5 tabs: Room, Grooming, Wardrobe, Culinary, Beat
- **Wired:** Starring page categories (Grooming, Wardrobe, Culinary, Lifestyle) now open lifestyle modals
- **Files:** `matey-lifestyle.js`, `starring.html`, `matey-preview.css`

### 4. Grooming Section
- **Photo Upload Only:** No camera access, file picker only
- **AI Validation:** Validates photo quality (front-facing, clear lighting, face visible). Returns specific improvement tips if insufficient
- **Analysis:** Extracts `face_shape` and `skin_tone`, stores in `matey-body-profile`
- **Suggestions:** Returns practical grooming suggestions with like/dislike learning
- **Files:** `matey-lifestyle.js`

### 5. Wardrobe Section
- **Digital Wardrobe:** Users upload clothing items with photo, color, pattern. Stored in `matey-wardrobe-items`
- **AI Outfit Curation:** Generates 2–4 complete outfits based on skin tone, face shape, body type, height, weight, and UAE weather
- **Learning:** Like/dislike on outfits stored in `matey-wardrobe-likes/dislikes`
- **Files:** `matey-lifestyle.js`

### 6. Culinary Section
- **No Dietary UI:** Removed all dietary restriction/allergy input fields
- **Ingredient-Based:** Text input + mic dictation for ingredients
- **Personalization Only:** Uses preferences from Settings → Personalization (`matey-profile`) if present. No separate preference forms
- **AI Behavior:** Suggests recipes based ONLY on ingredients provided. Not a diet-planning tool. Witty, resourceful responses for sparse ingredients (e.g., single tomato or egg)
- **Weather/Time Context:** AI receives current date/time for context-aware suggestions
- **Files:** `matey-lifestyle.js`

### 7. Markdown Syntax — Math Expression Support
- **Added:** `$$` syntax for math expressions
- **Example:** `$$ 11 + 25 + 85 + 1000 / 12 * 16.9999`
- **Behavior:** Evaluates expression and returns numeric result directly in chat
- **Files:** `matey-syntax.js`, `matey-init.js`

### 8. BYOK Vision Support
- **Added:** `chatVision()` and `sendVision()` to `MateyByok`
- **Behavior:** Converts Anthropic-style image blocks to OpenAI-compatible `image_url` format for vision-capable models
- **Files:** `matey-byok.js`

### 9. Adaptive ML Wiring
- **Wired:** Syntax tracking (`trackSyntax`) in `matey-syntax.js`
- **Wired:** Chat response tracking (`trackChatResponse`) in `matey-init.js`
- **Wired:** Adaptive context injection (`buildSystemContext`) into chat system prompt
- **Wired:** Upskilling suggestions (`suggestPrompt`) in chat input
- **Wired:** `renderAdaptive()` in settings open
- **Files:** `matey-syntax.js`, `matey-init.js`, `matey-settings.js`

### 10. AI Persona Update
- **Changed:** AI companion name from "Snap" to "Matey" across all system prompts
- **Tone:** Warm, friendly, gently witty — casual and supportive, not sharp or blunt
- **Files:** `matey-lifestyle.js`

---

## 11. Critical Bug Fixes — Audit & Repair
- **Missing `matey-chat.js`**: File was referenced in all HTML but didn't exist. Created it with a floating chat FAB and overlay toggle logic.
- **No chat trigger**: `matey-pull.js` requires `pull-hint` element to set up chat opening, but it was missing from all HTML pages. Added `pull-hint` to all 6 HTML files.
- **Tab system broken**: `matey-tabs.js` only recognized 4 tabs (starring, hooks, markdown, custom) but pages had hardcoded "Room" tab links. Added 'room' to `TAB_ORDER`, `tabUrl()`, and active-tab detection.
- **Markdown calculator silent**: `matey-md.js` called `MateySyntax.parse()` for `$$` expressions but ignored the return value. Updated it to display math results in a `.md-math-result` area below the editor.
- **CSS additions**: Added `.chat-fab` styles for the new chat trigger button, and `.md-result`/`.md-math-result` styles for markdown calculator output.
- **Files changed**: `matey-chat.js` (new), `matey-md.js`, `matey-tabs.js`, `matey-preview.css`, all `*.html` files.

## How to Restart / Continue Work

### Prerequisites
- Device IP: `192.168.10.131:35787`
- ADB wireless connected
- Android SDK build-tools 36.0.0 available at `/home/prp/Android/Sdk/build-tools/36.0.0/`
- Debug keystore at `/home/prp/.android/debug.keystore`

### Step-by-Step Restart

1. **Edit web assets** in:
   ```
   /home/prp/Documents/Matey/app/public/
   ```
   Key files:
   - `matey-lifestyle.js` — lifestyle hub, grooming, wardrobe, culinary, room
   - `matey-room.js` — room restyler
   - `matey-tabs.js` — navigation tabs
   - `matey-byok.js` — BYOK provider + vision
   - `matey-syntax.js` — markdown syntax parser
   - `matey-init.js` — chat initialization
   - `matey-settings.js` — settings page
   - `matey-preview.css` — styles
   - `starring.html` — main page
   - `room.html` — room page

2. **Rebuild APK** by updating assets in original APK:
   ```bash
   python3 << 'PYEOF'
   import zipfile, os
   src_apk = '/tmp/matey.apk'
   dst_apk = '/tmp/matey-final.apk'
   web_dir = '/home/prp/Documents/Matey/app/public'
   update_files = ['matey-tabs.js','matey-room.js','matey-lifestyle.js','matey-byok.js','matey-syntax.js','matey-init.js','matey-settings.js','matey-preview.css','starring.html','room.html']
   with zipfile.ZipFile(src_apk, 'r') as zin:
       with zipfile.ZipFile(dst_apk, 'w', zipfile.ZIP_DEFLATED) as zout:
           for item in zin.namelist():
               if item.startswith('assets/public/') and any(item.endswith(f) for f in update_files):
                   fname = os.path.basename(item)
                   local_path = os.path.join(web_dir, fname)
                   data = open(local_path, 'rb').read() if os.path.exists(local_path) else zin.read(item)
                   zout.writestr(item, data)
               else:
                   data = zin.read(item)
                   info = zin.getinfo(item)
                   zout.writestr(info, data)
   print("APK updated")
   PYEOF
   ```

3. **Align, sign, and install:**
   ```bash
   rm -f /tmp/matey-final-aligned.apk
   /home/prp/Android/Sdk/build-tools/36.0.0/zipalign -p -v 4 /tmp/matey-final.apk /tmp/matey-final-aligned.apk
   /home/prp/Android/Sdk/build-tools/36.0.0/apksigner sign --ks /home/prp/.android/debug.keystore --ks-key-alias androiddebugkey --ks-pass pass:android --key-pass pass:android /tmp/matey-final-aligned.apk
   adb -s 192.168.10.131:35787 install -r /tmp/matey-final-aligned.apk
   ```

4. **Verify on device:**
   ```bash
   adb -s 192.168.10.131:35787 shell monkey -p com.matey.app -c android.intent.category.LAUNCHER 1
   ```

---

## Current App State
- Navigation: Starring | Hooks | Markdown | Custom
- Room Restyler: Accessible via Lifestyle → Room tab (4-view upload)
- Grooming: Photo upload → face/skin analysis → suggestions with learning
- Wardrobe: Digital wardrobe (tops/bottoms) → AI outfit curation
- Culinary: Ingredient input + mic → recipe suggestions (no dietary forms)
- Beat: Periodic lifestyle recap
- Math: `$$` expressions evaluated in chat
- Tone: Warm, friendly, gently witty Matey persona
