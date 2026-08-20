import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft,
  Mic,
  Sparkles,
  Plus,
  Settings as SettingsIcon,
  Lock,
  Zap,
  Scissors,
  ChefHat,
  ListChecks,
  Rss,
  Camera,
  ChevronRight,
} from "lucide-react";
import { KnowledgeFeedScreen } from "./KnowledgeFeedScreen";
import { SettingsScreen } from "./SettingsScreen";
import { VigilanceScreen } from "./VigilanceScreen";
import { LibraryScreen } from "./LibraryScreen";
import { GhostIdeaPage } from "./GhostIdeaPage";
import { CustomTabScreen } from "./CustomTabScreen";
import { usePersona } from "./context/PersonaContext";
import { synthesizeIdea, archiveIdea } from "./services/ideaIncubatorService";
import { IdeaArtifact } from "./types/ideaIncubator";
import { settingsStore, privacyController } from "./lib/storage";
import { GeoContext, ManualRegionId } from "./types/geolocation";
import {
  MANUAL_REGION_OPTIONS,
  manualRegionToGeoContext,
  watchGeoContext,
} from "./services/geolocationService";
import {
  ThemePresetId,
  activateThemePreset,
  getStoredThemePresetId,
} from "./services/themeEngine";

type Tab = "Starting" | "Hooks" | "Library" | "Custom" | "Recap";

export default function App() {
  const { persona } = usePersona();
  const [activeTab, setActiveTab] = useState<Tab>("Starting");
  const [currentScreen, setCurrentScreen] = useState<"main" | "settings">(
    "main"
  );
  const [isPrivateMode, setIsPrivateMode] = useState(false);
  const [isSettingsReady, setIsSettingsReady] = useState(false);
  const [unveiledIdea, setUnveiledIdea] = useState<IdeaArtifact | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [geoContext, setGeoContext] = useState<GeoContext | null>(null);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [manualRegion, setManualRegion] = useState<ManualRegionId>("global");
  const [activeTheme, setActiveTheme] = useState<ThemePresetId>(() =>
    getStoredThemePresetId()
  );

  /** Matey1.txt §3 — Custom Tab state (hoisted; persisted via settingsStore). */
  const [customTabEnabled, setCustomTabEnabled] = useState(false);
  const [customTabConfig, setCustomTabConfig] = useState<string | null>(null);

  /** Re-read Custom Tab settings from the store (used after the wizard persists). */
  const syncCustomTab = useCallback(() => {
    try {
      const s = settingsStore.get();
      setCustomTabEnabled(s.customTabEnabled);
      setCustomTabConfig(s.customTabConfig ?? null);
    } catch {
      /* settings not hydrated yet */
    }
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    activateThemePreset(activeTheme);
  }, [activeTheme]);

  useEffect(() => {
    let cancelled = false;

    const hydrateSettings = async () => {
      try {
        const settings = await settingsStore.hydrate();
        if (cancelled) return;

        setIsPrivateMode(settings.privateMode === true);
        privacyController.setActive(settings.privateMode === true);
        setCustomTabEnabled(settings.customTabEnabled);
        setCustomTabConfig(settings.customTabConfig ?? null);
      } catch (error) {
        console.error("Failed to hydrate settings:", error);
        if (!cancelled) {
          setIsPrivateMode(false);
          privacyController.setActive(false);
        }
      } finally {
        if (!cancelled) {
          setIsSettingsReady(true);
        }
      }
    };

    void hydrateSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  const triggerSynthesis = async () => {
    const idea = await synthesizeIdea({
      isPrivateMode,
      persona,
      recentTechUpdates: [],
      geoContext,
    });
    if (idea) {
      setToast("New Venture Vector Unlocked");
      setTimeout(() => setUnveiledIdea(idea), 1500);
    } else if (isPrivateMode) {
      setToast("Synthesis Engine Dormant");
    }
  };

  useEffect(() => {
    if (!isSettingsReady) {
      return;
    }

    if (isPrivateMode) {
      setGeoContext(null);
      setGeoError(null);
      return;
    }

    const stop = watchGeoContext(
      (next) => {
        setGeoError(null);
        setGeoContext(next);
      },
      (error) => {
        setGeoError(error.message || "Location permission denied.");
        setGeoContext(manualRegionToGeoContext(manualRegion));
      },
      {
        distanceThresholdMeters: 300,
        debounceMs: 20000,
      }
    );

    return () => stop();
  }, [isPrivateMode, manualRegion, isSettingsReady]);

  const isSettingsScreen = currentScreen === "settings";

  const renderActiveTab = () => {
    switch (activeTab) {
      case "Starting":
        return (
          <main className="flex-1 overflow-y-auto px-1 pt-4 space-y-5">
            <section className="rounded-2xl border border-border-hard/10 bg-[var(--theme-surface-elevated)] p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-bg/10 text-bg">
                  <Scissors size={18} />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-bg">
                    Style Intelligence
                  </h3>
                  <p className="text-[9px] text-bg/50 uppercase tracking-wider font-bold">
                    Hairdo · Beard · Mustache
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-border-hard/5 bg-surface p-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-bg/5">
                  <Camera size={16} className="text-bg/50" />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-bold text-bg/70">
                    Upload your photo
                  </p>
                  <p className="text-[9px] text-bg/40">
                    AI-powered grooming recommendations
                  </p>
                </div>
                <ChevronRight size={14} className="text-bg/30" />
              </div>
            </section>

            <section className="rounded-2xl border border-border-hard/10 bg-[var(--theme-surface-elevated)] p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-bg/10 text-bg">
                  <ListChecks size={18} />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-bg">
                    Rules
                  </h3>
                  <p className="text-[9px] text-bg/50 uppercase tracking-wider font-bold">
                    Personal guardrails & preferences
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {[
                  { label: "Halal dietary mode", active: isPrivateMode },
                  { label: "Privacy-first telemetry", active: isPrivateMode },
                  { label: "Geo-fenced synthesis", active: !isPrivateMode },
                ].map((rule, i) => (
                  <div
                    key={i}
                    className="flex items-center justify-between rounded-xl border border-border-hard/5 bg-surface px-3 py-2.5"
                  >
                    <span className="text-[10px] font-bold text-bg/70">
                      {rule.label}
                    </span>
                    <div
                      className={`w-8 h-4 rounded-full relative transition-colors ${
                        rule.active ? "bg-bg" : "bg-bg/10"
                      }`}
                    >
                      <div
                        className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${
                          rule.active
                            ? "left-4 bg-surface"
                            : "left-0.5 bg-bg/40"
                        }`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-border-hard/10 bg-[var(--theme-surface-elevated)] p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-bg/10 text-bg">
                  <ChefHat size={18} />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-bg">
                    Culinary
                  </h3>
                  <p className="text-[9px] text-bg/50 uppercase tracking-wider font-bold">
                    Recipe engine & kitchen intelligence
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-border-hard/5 bg-surface p-3">
                <p className="text-[10px] font-bold text-bg/70 mb-2">
                  Pantry scan
                </p>
                <p className="text-[9px] text-bg/40 leading-relaxed">
                  Snap a photo of your ingredients. The AI recommends recipes
                  based on what you have, your dietary rules, and local weather.
                </p>
              </div>
            </section>

            <section className="rounded-2xl border border-border-hard/10 bg-[var(--theme-surface-elevated)] p-4">
              <div className="flex items-center gap-3 mb-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-bg/10 text-bg">
                  <Rss size={18} />
                </div>
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-widest text-bg">
                    Hooks
                  </h3>
                  <p className="text-[9px] text-bg/50 uppercase tracking-wider font-bold">
                    Semantic vigilance & monitoring
                  </p>
                </div>
              </div>
              <div className="rounded-xl border border-border-hard/5 bg-surface p-3">
                <p className="text-[10px] font-bold text-bg/70 mb-2">
                  Active monitors
                </p>
                <p className="text-[9px] text-bg/40 leading-relaxed">
                  Set semantic hooks to track price changes, restocks, and
                  market signals across your interests.
                </p>
              </div>
            </section>
          </main>
        );
      case "Hooks":
        return (
          <div className="flex-1 overflow-y-auto py-4">
            <VigilanceScreen onBack={() => setActiveTab("Starting")} />
          </div>
        );
      case "Library":
        return (
          <div className="flex-1 overflow-y-auto">
            <LibraryScreen />
          </div>
        );
      case "Custom":
        if (!customTabEnabled) return null;
        return (
          <div className="flex-1 overflow-hidden">
            <CustomTabScreen
              configBlob={customTabConfig}
              onRequestConfigure={() => setCurrentScreen("settings")}
            />
          </div>
        );
      case "Recap":
        return (
          <KnowledgeFeedScreen
            onBack={() => setActiveTab("Starting")}
            isPrivateMode={isPrivateMode}
            geoContext={geoContext}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-surface px-0 py-0 text-bg antialiased sm:p-3">
      <div className="mx-auto flex h-[100dvh] w-full max-w-[420px] flex-col overflow-hidden border border-border-hard/10 bg-surface text-bg shadow-[0_0_0_1px_rgba(250,248,245,0.04)] sm:h-[calc(100dvh-1.5rem)] sm:rounded-[30px]">
        {isSettingsScreen ? (
          <SettingsScreen
            onBack={() => setCurrentScreen("main")}
            activeTheme={activeTheme}
            onThemeChange={setActiveTheme}
            customTabEnabled={customTabEnabled}
            customTabConfig={customTabConfig}
            onCustomTabChange={(enabled, config) => {
              void settingsStore.setCustomTabConfig(enabled, config);
              setCustomTabEnabled(enabled);
              setCustomTabConfig(config);
            }}
            onCustomTabConfigured={syncCustomTab}
          />
        ) : (
          <>
            {unveiledIdea && (
              <GhostIdeaPage
                idea={unveiledIdea}
                onDismiss={() => setUnveiledIdea(null)}
                onArchive={(idea) => archiveIdea(idea)}
              />
            )}

            {toast && (
              <div className="absolute left-1/2 top-5 z-[100] -translate-x-1/2 rounded-full border border-border-hard/10 bg-bg px-4 py-2 text-[10px] font-bold uppercase tracking-[0.22em] text-surface shadow-2xl">
                <div className="flex items-center gap-2">
                  <Sparkles size={12} className="text-surface" />
                  {toast}
                </div>
              </div>
            )}

            <div className="flex h-full w-full flex-col overflow-hidden px-5 pb-4 pt-4">
              <header className="flex-shrink-0 border-b border-border-hard/10 pb-4">
                <div className="flex items-center justify-between">
                  <button className="flex h-10 w-10 items-center justify-center rounded-full border border-border-hard/10 bg-transparent text-bg/80 transition-colors hover:border-border-hard/30 hover:text-bg">
                    <ArrowLeft size={22} strokeWidth={2.2} />
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={async () => {
                        if (!isSettingsReady) return;

                        const nextPrivateMode = !isPrivateMode;
                        setIsPrivateMode(nextPrivateMode);
                        privacyController.setActive(nextPrivateMode);
                        setToast(
                          nextPrivateMode
                            ? "Privacy Active · Geo Locked"
                            : "Synthesis Active"
                        );

                        try {
                          await settingsStore.set({
                            privateMode: nextPrivateMode,
                          });
                        } catch (error) {
                          console.error(
                            "Failed to persist private mode:",
                            error
                          );
                          setIsPrivateMode(!nextPrivateMode);
                          privacyController.setActive(!nextPrivateMode);
                          setToast("Unable to update privacy mode");
                        }
                      }}
                      disabled={!isSettingsReady}
                      className={`flex h-10 w-10 items-center justify-center rounded-full border transition-all ${
                        isPrivateMode
                          ? "border-border-hard/20 bg-bg text-surface"
                          : "border-border-hard/10 bg-transparent text-bg/80 hover:border-border-hard/30 hover:text-bg"
                      } ${
                        !isSettingsReady ? "cursor-not-allowed opacity-50" : ""
                      }`}
                    >
                      <Lock size={18} strokeWidth={2.4} />
                    </button>

                    <button
                      onClick={() => setCurrentScreen("settings")}
                      className="flex h-10 w-10 items-center justify-center rounded-full border border-border-hard/10 bg-transparent text-bg/80 transition-colors hover:border-border-hard/30 hover:text-bg"
                    >
                      <SettingsIcon size={18} strokeWidth={2.2} />
                    </button>
                  </div>
                </div>

                <div className="mt-5 flex items-end justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-[0.28em] text-bg/70">
                      Matey
                    </p>
                    <h1
                      className="mt-2 text-[2.9rem] font-black leading-none tracking-[-0.08em] text-bg"
                      style={{ fontFamily: "Georgia, serif" }}
                    >
                      Matey
                    </h1>
                  </div>

                  <button
                    onClick={triggerSynthesis}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-border-hard/10 bg-bg/5 text-bg/70 transition-colors hover:border-border-hard/20 hover:text-bg"
                  >
                    <Zap size={17} />
                  </button>
                </div>

                <div className="mt-5 rounded-full border border-border-hard/10 bg-[var(--theme-surface-elevated)] px-3 py-2">
                  <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[0.28em] text-bg/55">
                    <span>Rev Meter</span>
                    <span>65% Limit</span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-bg/8">
                    <div
                      className="h-full rounded-full bg-bg transition-all duration-700 ease-out"
                      style={{ width: "65%" }}
                    />
                  </div>
                </div>

                {!isPrivateMode && (
                  <div className="mt-4 rounded-2xl border border-border-hard/10 bg-[var(--theme-surface-elevated)] p-3">
                    <p className="text-[9px] font-black uppercase tracking-[0.22em] text-bg/55">
                      Geo intelligence source:{" "}
                      {geoContext?.source === "manual"
                        ? "Manual region"
                        : "Live sensor"}
                    </p>
                    <p className="mt-2 text-[11px] text-bg/75">
                      {geoContext
                        ? `${geoContext.marketRegion} • ${geoContext.regulatoryLens}`
                        : "Acquiring geolocation context…"}
                    </p>
                    {geoError && (
                      <p className="mt-2 text-[10px] text-bg/80">
                        Location fallback active: {geoError}
                      </p>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-bg/55">
                        Region override
                      </label>
                      <select
                        value={manualRegion}
                        onChange={(e) => {
                          const next = e.target.value as ManualRegionId;
                          setManualRegion(next);
                          setGeoContext(manualRegionToGeoContext(next));
                        }}
                        className="flex-1 rounded-xl border border-border-hard/10 bg-surface px-2 py-1.5 text-[10px] text-bg outline-none"
                      >
                        {MANUAL_REGION_OPTIONS.map((option) => (
                          <option key={option.id} value={option.id}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                <div className="mt-5 flex items-center justify-center">
                  <div className="inline-flex items-center rounded-full border border-border-hard/10 bg-[var(--theme-surface-elevated)] p-1">
                    {(customTabEnabled
                      ? ([
                          "Starting",
                          "Hooks",
                          "Library",
                          "Custom",
                          "Recap",
                        ] as Tab[])
                      : (["Starting", "Hooks", "Library", "Recap"] as Tab[])
                    ).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`rounded-full px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.22em] transition-all ${
                          activeTab === tab
                            ? "bg-bg text-surface"
                            : "text-bg/55 hover:text-bg"
                        }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>
              </header>

              <div className="flex-1 overflow-hidden pt-4">
                {renderActiveTab()}
              </div>

              <div className="mt-4 flex-shrink-0 rounded-[26px] border border-border-hard/10 bg-[var(--theme-surface-elevated)] px-2 py-2 shadow-[0_12px_30px_rgba(0,0,0,0.28)]">
                <div className="flex items-center gap-2">
                  <button className="flex h-11 w-11 items-center justify-center rounded-full bg-bg text-surface transition-transform active:scale-95">
                    <Plus size={20} strokeWidth={2.4} />
                  </button>

                  <div className="flex flex-1 items-center gap-2 rounded-full border border-border-hard/5 bg-surface px-3 py-2.5">
                    <span
                      className="text-[1.15rem] font-black italic text-bg"
                      style={{ fontFamily: "Georgia, serif" }}
                    >
                      Matey
                    </span>
                    <span className="flex-1 text-[0.98rem] text-bg/35">
                      Ask...
                    </span>
                  </div>

                  <button className="flex h-11 w-11 items-center justify-center rounded-full border border-border-hard/10 bg-transparent text-bg/80 transition-colors hover:border-bg/25 hover:text-bg">
                    <Mic size={18} strokeWidth={2.2} />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
