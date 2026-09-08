import React, { useState } from "react";
import {
  ArrowLeft,
  BrainCircuit,
  Activity,
  Sliders,
  ChevronRight,
  Info,
  Zap,
  Palette,
  Repeat,
  Check,
  Plus,
  Trash2,
} from "lucide-react";
import { NeuralState } from "./types/mlInsight";
import {
  ThemePresetId,
  THEME_PRESET_ORDER,
  THEME_PRESETS,
  getNextThemePresetId,
} from "./services/themeEngine";
import { CustomTabWizard } from "./CustomTabWizard";
import { getNetworkLog, clearNetworkLog } from "./lib/networkLog";

interface SettingsScreenProps {
  onBack: () => void;
  onThemeChange: (theme: ThemePresetId) => void;
  activeTheme: ThemePresetId;
  /** Matey1.txt §3 — Custom Tab state, hoisted from App (persisted in settings). */
  customTabEnabled: boolean;
  customTabConfig: string | null;
  onCustomTabChange: (enabled: boolean, config: string | null) => void;
  onCustomTabConfigured: () => void;
}

export const SettingsScreen: React.FC<SettingsScreenProps> = ({
  onBack,
  activeTheme,
  onThemeChange,
  customTabEnabled,
  customTabConfig,
  onCustomTabChange,
  onCustomTabConfigured,
}) => {
  const [deepInsight, setDeepInsight] = useState(false);
  const [showWizard, setShowWizard] = useState(false);

  const mockNeuralState: NeuralState = {
    behavioralVector:
      "Preference Cluster: Minimalist / High-Frequency Execution",
    adaptiveWeights: {
      "Matte Aesthetics": 0.92,
      "Grooming Frequency": 0.78,
      "Plant-Based Recipes": 0.45,
      "Renewable Energy News": 0.88,
    },
    deepInsightEnabled: deepInsight,
  };

  const currentPreset = THEME_PRESETS[activeTheme];

  const cycleTheme = () => {
    onThemeChange(getNextThemePresetId(activeTheme));
  };

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface text-bg">
      <header className="flex-shrink-0 px-6 pb-4 pt-12 border-b border-border-hard/10">
        <button
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border-hard/10 bg-transparent text-bg/80 transition-colors hover:border-border-hard/30 hover:text-bg"
        >
          <ArrowLeft size={22} strokeWidth={2.2} />
        </button>
        <h1 className="mt-6 text-3xl font-black tracking-tight text-bg leading-tight">
          Settings
        </h1>
      </header>

      <main className="flex-1 overflow-y-auto px-4 space-y-6 pb-20 pt-4">
        <section className="rounded-3xl border border-border-hard/10 bg-[var(--theme-surface-elevated)] p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-bg/10 text-bg">
              <BrainCircuit size={20} />
            </div>
            <div>
              <h2 className="text-sm font-bold uppercase tracking-widest text-bg">
                AUI · AUL Architecture
              </h2>
              <p className="text-[10px] text-bg/50 uppercase tracking-wider font-bold">
                Active Interaction · Adaptive Learning
              </p>
            </div>
          </div>

          <div className="mb-6 p-4 rounded-2xl bg-surface border border-border-hard/5">
            <div className="flex items-center gap-2 mb-2">
              <Zap size={14} className="text-bg" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-bg">
                System Philosophy
              </span>
            </div>
            <p className="text-[11px] leading-relaxed text-bg/60 font-medium">
              Your natural touchpoints serve as high-signal data. Frictionless
              telemetry maps behavior in real-time.
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-bg/40 block mb-2">
                Behavioral Vector Map
              </label>
              <div className="p-4 rounded-xl bg-surface border border-border-hard/5">
                <p className="text-xs font-bold text-bg">
                  {mockNeuralState.behavioralVector}
                </p>
              </div>
            </div>

            <div>
              <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-bg/40 block mb-2">
                Adaptive Vector Weights
              </label>
              <div className="space-y-3">
                {Object.entries(mockNeuralState.adaptiveWeights).map(
                  ([key, value]) => (
                    <div key={key}>
                      <div className="flex justify-between text-[10px] mb-1">
                        <span className="text-bg/60 font-bold">{key}</span>
                        <span className="font-mono text-bg font-black">
                          {(value * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="h-1 w-full bg-bg/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-bg rounded-full"
                          style={{ width: `${value * 100}%` }}
                        />
                      </div>
                    </div>
                  )
                )}
              </div>
            </div>

            <div className="pt-4 border-t border-border-hard/5 flex items-center justify-between">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-bg">
                  Deep Insight Mode
                </h3>
                <p className="text-[10px] text-bg/60">
                  Expose raw ML metadata.
                </p>
              </div>
              <button
                onClick={() => setDeepInsight(!deepInsight)}
                className={`w-10 h-5 rounded-full transition-colors relative ${
                  deepInsight ? "bg-bg" : "bg-bg/10"
                }`}
              >
                <div
                  className={`absolute top-0.5 w-3 h-3 rounded-full transition-all ${
                    deepInsight ? "left-6 bg-surface" : "left-0.5 bg-bg/40"
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-border-hard/10 bg-[var(--theme-surface-elevated)] p-6">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-bg/10 text-bg">
                <Palette size={18} />
              </div>
              <div>
                <h2 className="text-sm font-bold uppercase tracking-widest text-bg">
                  Theme Configuration Engine
                </h2>
                <p className="text-[10px] text-bg/50 uppercase tracking-wider font-bold">
                  Hard/Dark Groovebox Presets
                </p>
              </div>
            </div>

            <button
              onClick={cycleTheme}
              className="inline-flex items-center gap-1 rounded-full border border-border-hard/20 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-bg/70 hover:bg-bg hover:text-surface transition-all"
            >
              <Repeat size={11} />
              Next
            </button>
          </div>

          <div className="rounded-2xl border border-border-hard/10 bg-surface p-3">
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-[0.2em] text-bg/50">
                Active Preset
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-bg">
                {currentPreset.label}
              </span>
            </div>

            <div className="mt-3 grid grid-cols-4 gap-2">
              <div
                className="h-7 rounded-lg border border-border-hard/10"
                style={{ backgroundColor: currentPreset.surface }}
              />
              <div
                className="h-7 rounded-lg border border-border-hard/10"
                style={{ backgroundColor: currentPreset.textPrimary }}
              />
              <div
                className="h-7 rounded-lg border border-border-hard/10"
                style={{ backgroundColor: currentPreset.accentPrimary }}
              />
              <div
                className="h-7 rounded-lg border border-border-hard/10"
                style={{ backgroundColor: currentPreset.accentSecondary }}
              />
            </div>
          </div>

          <div
            role="radiogroup"
            aria-label="Theme presets"
            className="mt-3 max-h-52 overflow-y-auto space-y-1 pr-1"
          >
            {THEME_PRESET_ORDER.map((presetId) => {
              const preset = THEME_PRESETS[presetId];
              const isActive = presetId === activeTheme;

              return (
                <button
                  key={presetId}
                  role="radio"
                  aria-pressed={isActive}
                  aria-label={`Apply ${preset.label} theme`}
                  onClick={() => onThemeChange(presetId)}
                  className={`w-full flex items-center justify-between rounded-xl border px-3 py-2 transition-all ${
                    isActive
                      ? "border-bg bg-bg text-surface"
                      : "border-border-hard/10 bg-surface text-bg hover:bg-bg/5"
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: preset.accentPrimary }}
                      aria-hidden={isActive ? undefined : true}
                    />
                    <span className="truncate text-[10px] font-bold uppercase tracking-wider">
                      {preset.label}
                    </span>
                  </div>
                  {isActive ? (
                    <Check size={14} />
                  ) : (
                    <ChevronRight size={14} className="opacity-60" />
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* Matey1.txt §3 — Navigation: standalone Custom Tab toggle */}
        <section className="space-y-2">
          <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-bg/40 px-2 block">
            Navigation
          </label>
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => {
                onCustomTabChange(!customTabEnabled, customTabConfig);
                if (!customTabEnabled) setShowWizard(true);
              }}
              className="w-full flex items-center justify-between p-3 rounded-xl border border-border-hard/5 bg-surface hover:bg-bg/5 transition-all"
            >
              <div className="flex items-center gap-3">
                <span className="text-lg" aria-hidden>
                  🧭
                </span>
                <span className="text-sm font-bold text-bg">Custom Tab</span>
              </div>
              <span
                className={`text-[10px] font-black uppercase tracking-wider ${
                  customTabEnabled ? "text-bg" : "text-bg/40"
                }`}
                aria-hidden
              >
                {customTabEnabled ? "On" : "Off"}
              </span>
            </button>

            {customTabEnabled && !customTabConfig && (
              <button
                type="button"
                onClick={() => setShowWizard(true)}
                className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border border-dashed border-border-hard/10 text-bg/50 hover:border-bg hover:text-bg transition-all"
              >
                <Plus size={14} />
                <span className="text-[10px] font-black uppercase tracking-widest">
                  Configure New Tab +
                </span>
              </button>
            )}

            {customTabEnabled && customTabConfig && (
              <button
                type="button"
                onClick={() => setShowWizard(true)}
                className="w-full flex items-center justify-between p-2.5 rounded-xl border border-border-hard/5 bg-bg/5 text-bg/60 hover:text-bg transition-all"
              >
                <span className="text-[10px] font-medium">
                  Reconfigure tab…
                </span>
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-bg/40 px-2 block">
            Account
          </label>
          <div className="space-y-1">
            {[
              { icon: <Activity size={18} />, label: "Usage Analytics" },
              { icon: <Sliders size={18} />, label: "Preferences" },
              { icon: <Info size={18} />, label: "About Matey" },
            ].map((item, i) => (
              <button
                key={i}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-[var(--theme-surface-elevated)] border border-border-hard/5 hover:bg-bg/5 transition-all"
              >
                <div className="flex items-center gap-3">
                  <span className="text-bg/60">{item.icon}</span>
                  <span className="text-sm font-bold text-bg">
                    {item.label}
                  </span>
                </div>
                <ChevronRight size={16} className="text-bg/20" />
              </button>
            ))}
          </div>
        </section>

        {/* Matey1.txt §3 — Transparency: Network Activity log */}
        <section className="space-y-2">
          <label className="text-[9px] font-bold uppercase tracking-[0.2em] text-bg/40 px-2 block">
            Network Activity
          </label>
          <div className="space-y-1">
            {/*
              Log of outbound URLs the app has contacted.
              Real hostnames only — no packet-level inspection.
              Manually clearable from this screen.
            */}
            <div className="h-96 overflow-auto rounded-xl border border-border-hard/10 bg-[var(--theme-surface-elevated)] p-4 text-[9px] text-bg/60">
              {getNetworkLog().map((entry, i) => (
                <div key={i} className="flex items-center justify-between pb-1 border-b border-border-hard/5">
                  <span className="truncate text-[9px]">{entry.hostname}</span>
                  <span className="text-[9px] text-bg/40">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
            <button
              onClick={clearNetworkLog}
              className="mt-2 w-full flex items-center justify-center gap-2 p-2 rounded-xl border border-dashed border-border-hard/10 text-bg/50 hover:border-bg hover:text-bg transition-all"
            >
              <Trash2 size={14} />
              <span className="text-[10px] font-black uppercase tracking-wider">
                Clear log
              </span>
            </button>
          </div>
        </section>
      </main>

      {showWizard && (
        <CustomTabWizard
          onClose={() => setShowWizard(false)}
          onDone={() => {
            setShowWizard(false);
            onCustomTabConfigured();
          }}
        />
      )}
    </div>
  );
};
