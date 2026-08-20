# Matey — Personal AI Concierge

Matey is a privacy-first, local-first personal AI concierge app. Vanilla web frontend wrapped in Capacitor for Android, with BYOK (bring-your-own-key) AI providers, on-device Whisper speech-to-text, a syntax-driven note vault, personalized daily brief + RSS reader, and 6 dark themes.

## Folder structure

```
Matey/
├── app/                  # Capacitor app (source of truth)
│   ├── public/           # Web frontend: HTML pages, matey-*.js modules, CSS, images
│   ├── android/          # Generated Android project (build with Gradle)
│   ├── capacitor.config.ts
│   └── package.json
├── docs/                 # Audits, blueprints, requirement notes
├── themes/               # Source theme JSON files (Metal, GraphiteXX, Dark Death, Nixdorf 8870, Code Green)
├── assets/               # Brand assets (logo)
└── README.md
```

## Frontend modules (app/public)

| File | Responsibility |
|---|---|
| matey-boot.js | Native detection + one-time legacy snap→matey data migration |
| matey-themes.js | 6 dark themes, CSS-variable application, theme picker |
| matey-settings.js | Single-source settings panel + BYOK dialog injection, recap renderer |
| matey-byok.js | Provider manager + chat completions pipeline (auto model detection) |
| matey-syntax.js | `**` `##` `//` `??` `!!` parser, vault, KB search |
| matey-init.js | Chat wiring (syntax + AI), Whisper UI, mic, license, notes |
| matey-feed.js | Daily personalized brief + live RSS reader |
| matey-rss.js | RSS fetch (with CORS proxy fallback) + profile filtering |
| matey-ai.js | On-device behavior learning + insights |
| matey-tabs.js | Draggable tab reorder (long-press) |
| matey-swipe.js | Swipe between pages |
| matey-whisper.js | Transformers.js Whisper (offline STT) |
| matey-md.js | Markdown editor autosave |
| matey-chat.js / matey-pull.js | Chat overlay gestures / pull-down bar |
| matey-profile.js / matey-license.js / matey-greet.js | Profile store, $5 Pro license shell, greetings |

## Build & run

```bash
# Web preview
cd app/public && python3 -m http.server 3000

# Android APK
cd app && npx cap sync android
cd android && JAVA_HOME=<jdk21> ANDROID_HOME=<sdk> ./gradlew assembleDebug
adb install app/build/outputs/apk/debug/app-debug.apk
```

## Data model (localStorage, all matey-*)

matey-profile · matey-vault · matey-session-notes · matey-priority · matey-recap · matey-markdown · matey-theme · matey-providers · matey-rss-feeds · matey-license · matey-ai-learning · matey-tab-order · matey-intel-feed

## Status

See docs/Matey_App_Comprehensive_Audit.docx for the full architecture audit, design audit, and refactor log.

## Monetization — one-time "Matey ∞" unlock

No subscriptions, no recurring fees. A single **one-time** purchase unlocks Matey ∞:

- Unlimited permanent notes + full recap history (memory)
- Ask Matey — deep memory retrieval across your vault (recall)
- Proactive actions — daily brief, priority board, scheduled reminders (agent)
- Encrypted multi-device sync (sync)
- BYOK providers + local model support (keys)
- All themes

Free tier keeps note-taking, the daily brief feed, RSS reading, the default theme, and on-device Whisper. BYOK stays bring-your-own-spend — Matey never resells tokens.
