**Prompt for Kilo Code — Unified Brain (full build, no deferral)**

This unifies three already-built local systems (Fix Memory / Instinct, AST Index / Project DNA, Style Memory) under one BrainState manager, adds provenance + confidence ceilings, and adds the Strategy Library shared-wisdom module. Everything in this prompt stays on-device except the one explicitly-scoped registry sync in Section 3 — do not add any other new network call.

---

### 1. BrainState unification (low risk — mostly relabeling existing systems)

- Create a single `BrainState` manager (e.g. `matey-brain.js`) that owns references to the existing Fix Memory store, AST Index, and Style Memory — do NOT rewrite or duplicate their storage, just wrap them under one interface.
- Expose a `BrainState` object with: `instinctCount`, `localCoverage` (% of tasks resolved via Instinct hit vs. cloud fallback — compute this from existing Fix-Memory hit/miss data, don't invent new tracking if the data already exists), `avgLatencySavedMs`, `tokensSavedEstimate`, `styleProfileVersion`, `dnaNodeCount`.
- Confirm real numbers for all six fields from actual on-device data before reporting this done — do not report placeholder/zero values as if they were real.

### 2. Provenance + confidence ceilings (small addition to existing InstinctEngine)

- Add a `provenance` field to every Instinct/Fix-Memory record: `"cloud"` (learned from an API call), `"user"` (learned from a manual correction), `"community"` (imported from the Strategy Library, see Section 3).
- Add a `confidenceCeiling` field: 0.9 for `user`/`cloud`-sourced instincts (personal experience), 0.6 for `community`-sourced ones — community-sourced instincts must never be allowed to exceed 0.6 confidence regardless of how many times they're reinforced, so they can suggest but never fully override personal experience.
- Backfill existing Fix Memory records with `provenance: "cloud"` (since none of them came from the community channel yet) rather than leaving the field undefined.
- Show me the real updated schema and one real record pulled from actual local storage as proof.

### 3. Strategy Library (new — shared wisdom, no server, real ongoing cost accepted)

Be direct that this introduces a genuine new maintenance responsibility (periodic PR moderation, a hosted static file) — build it, but confirm each safety property below actually holds, don't just assert it.

- **Bundled strategy list**: ship a static JSON list of abstract fix strategies with stable IDs (e.g. `S-001: "Wrap recursive struct in Box<T>"`). Start with a real, small initial set (10-20 entries) covering patterns already seen in this project's own Fix Memory data if possible — do not invent generic placeholder strategies with no grounding.
- **What gets shared, and ONLY this**: normalized tuples of `(errorCategory, language, strategyId, successCount)` — e.g. `(type_mismatch, javascript, S-001, 312)`. Confirm in code (not just in a comment) that no error text, code snippet, filename, or identifier is ever included in what's synced outward. Show me the actual serialization function.
- **Distribution channel**: a static JSON file hosted on GitHub Pages (free, no server). The app fetches it periodically (once per day max) in the background — confirm this is the only new outbound network call added by this feature, and that it fetches from a fixed, hardcoded URL you control, not anything derived from user data.
- **Contribution path**: outgoing contribution data (this device's own tuples) should batch and anonymize before being prepared for a PR — since you're a solo dev, the "automated PR from an anonymized batch process" can start as a manual export the user can trigger (or you collect later), not a fully automated pipeline yet; don't over-build automation neither of us has bandwidth to maintain — get the actual data-shape and privacy properties right first, automate submission later.
- **Off by default**: confirm the Strategy Library sync is OFF until explicitly enabled in Settings (a "Community Wisdom" toggle, clearly explained in one plain sentence: "Share anonymized fix-pattern stats to help other Matey users, and receive theirs — no code or personal data is ever shared"). Users must be able to disable it entirely and this must actually stop the background fetch, not just hide the toggle.
- **Consensus filtering**: an imported community strategy only becomes an instinct candidate once its aggregate success count crosses a real threshold (define one, e.g. success count > 20 and success rate > 70%) — confirm this threshold is actually enforced in code before a community entry can ever be surfaced to the user, not just documented as intent.

### 3b. Brain integrity fixes (fold in BEFORE Section 3 ships — these close real design gaps, not new features)

- **Promotion ladder**: a community-sourced instinct (`provenance: "community"`) that is successfully applied and locally verified 3 times promotes to `provenance: "cloud"` and inherits the 0.9 ceiling. One-way, logged with a timestamp, explicit in code — do not leave community entries frozen at 0.6 forever.
- **Layer arbitration order**: when Instinct/Style/DNA disagree, resolve via a single `resolveConflict(layers[])` function in BrainState, order: DNA (current structural reality) > Style (user identity) > Instinct (pattern memory) > Community (external suggestion). IMPORTANT CAVEAT: this ranking only decides between multiple functionally-equivalent options (e.g. stylistic fix variants) — it must never override the existing WASM pre-flight correctness check. A technically broken suggestion is rejected by pre-flight regardless of which layer it came from; arbitration order is a tie-breaker among valid options, not a correctness override.
- **DNA→Instinct invalidation cascade**: when the AST Index registers a structural change (rename, signature change, refactor) to a node that an existing instinct's `contextASTSignature` references, mark that instinct `stale: true` — do NOT delete it, keep its history intact. Stale instincts must not match/fire until (if ever) a future update re-validates them.
- **Cold-start framing**: for a brand-new user with an empty Instinct DB, do not show `localCoverage: 0%` as if it's a failure state. For the first N tasks (pick a reasonable N, e.g. 15-20), frame the dashboard positively but honestly — e.g. "Building your brain: X experiences learned, local resolution starts appearing soon." No fabricated numbers — same discipline as Section 6 — just honest framing instead of a discouraging zero.
- **Provenance-safe failure learning**: when a community-sourced instinct fails locally, decrement ONLY the local record's confidence — never let this failure flow into the exported Strategy Library tuple for that strategy. Exported tuples must only ever reflect a device's own real successes/failures for strategies it personally exercised, never secondhand/imported counts. Confirm this in code, not just in a comment.
- **Schema versioning**: add a single `brainSchemaVersion` integer, checked at BrainState startup, with an explicit migration chain (v1→v2→v3...) and backfill rules for new fields — generalize the same backfill discipline already required for the `provenance` field in Section 2, so future schema changes don't require one-off migration code each time.
- **Deliberate deferral (document, do not build)**: signature-subdivision on user rejection (narrowing the AST-shape boundary of a failing instinct instead of just demoting the whole record) is a real quality improvement but not required for v1. Add a code comment at the rejection-handling site explicitly noting this as a known, deliberate deferral — not a silent gap — so it isn't rediscovered as a "bug" later.

### 4. Dashboard surface

- Add `localCoverage` (and ideally the other BrainState numbers) to wherever the app's existing privacy/settings dashboard lives — real computed number, phrased plainly, e.g. "Matey resolved X% of your problems locally this month." Do not fabricate a rounder/more impressive number than what the real data shows.

### 5. What NOT to do

- Do not add any network call beyond the one daily Strategy Library fetch (and the user-triggered contribution export, if you build that now).
- Do not let community-sourced confidence exceed 0.6 under any circumstance.
- Do not report BrainState numbers, the strategy list, or the tuple-serialization privacy property as "done" without pasting the real code and real on-device numbers.

### 6. Required proof before reporting done

- Real BrainState object printed from an actual device session, all 6 fields populated with real (not placeholder) numbers.
- Real Fix Memory record showing the new `provenance` and `confidenceCeiling` fields.
- Real pasted serialization function proving only the 4-field tuple leaves the device, nothing else.
- Real screenshot of the "Community Wisdom" toggle, default OFF, and confirmation that toggling it off actually halts the background fetch (not just hides UI).
- Real dashboard screenshot showing the actual computed `localCoverage` percentage (or the honest cold-start framing if this is a fresh test profile).
- Real example of a promoted instinct (community→cloud after 3 verified uses), with the actual before/after record and timestamp.
- Real example of `resolveConflict()` being invoked with a genuine layer disagreement, showing the actual chosen result and which layer won.
- Real example of an instinct being marked `stale: true` after a real AST-detected rename/signature change, with the instinct's history still intact (not deleted).
- Confirm `brainSchemaVersion` exists and paste the real migration-chain code, even if it's currently just v1→v1 (no-op) since this is the first version — the structure must exist now, not be added later.

No narrated "should work" claims anywhere in the report back — every item needs real evidence.
