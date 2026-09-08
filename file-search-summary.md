# File Attachment Picker Components Search Summary

## Search Context
Searched codebase at `/home/prp/Documents/Matey` for file attachment picker/components, file inputs, and accept attributes.

## Key Findings

### 1. File Input Components are in Bundled JS Files, Not React Source
- The `src/components/` directory is **empty**
- No `<input type="file">` elements found in any `.tsx` or `.ts` source files
- No `AttachmentPicker` or similar named components in source code
- File inputs implemented as plain JavaScript in bundled public files

### 2. File Input Components Found in `app/public/*.js`

#### a) `matey-lifestyle.js` - 3 file inputs

**Grooming Upload (line 132):**
- `<input type="file" accept="image/*" id="grooming-file" style="position:absolute;opacity:0;width:0;height:0;overflow:hidden" />`
- **accept**: `image/*`
- **Validation**: Reads file, validates image sufficiency for face shape/skin tone analysis using AI (chatVision)
- **UI flow**: Hidden input clicked via "Choose Photo" button → shows preview → validate button → AI analysis

**Wardrobe Upload (line 206):**
- `<input type="file" accept="image/*" id="wardrobe-item-file" style="position:absolute;opacity:0;width:0;height:0;overflow:hidden" />`
- **accept**: `image/*`
- **UI**: Hidden input with "Add Photo" button, photo preview functionality

**Living Space Upload (lines 542, 635):**
- `<input type="file" accept="image/*" id="living-file" style="display:none" />`
- **accept**: `image/*`
- **UI**: Hidden input, "Choose Photo" button, generates layout options based on room type

#### b) `matey-ide.js` - 1 file input

**IDE Theme File (line 157):**
- `<input type="file" id="ide-theme-file" accept=".json,application/json" style="display:none" />`
- **accept**: `.json,application/json`
- **Purpose**: Allows users to pick JSON theme files for editor theme selection

### 3. Accept Attributes Summary

| Component | accept Value | Purpose |
|-----------|-------------|---------|
| grooming-file | `image/*` | User selfie for face shape/skin tone analysis |
| wardrobe-item-file | `image/*` | Photo for wardrobe/outfit suggestions |
| living-file | `image/*` | Photo of space for room restyling/layout analysis |
| ide-theme-file | `.json,application/json` | JSON editor theme files |

### 4. Common Patterns
- All file inputs are **hidden** using absolute positioning + zero dimensions or display:none
- Triggered programmatically via button click events
- Use `FileReader` or async `readFile()` to read selected files
- Validation logic varies: some use AI analysis, others use basic file reading
- All follow pattern: `fileInput.addEventListener('change', ...)` to handle selection

### 5. No React Components
- No file picker components in the React source (`src/`)
- File handling is done in vanilla JS within bundled files
- Source TypeScript files focus on UI state, not file input rendering