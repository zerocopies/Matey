import React, { useState } from "react";
import { X, Sparkles } from "lucide-react";
import {
  CUSTOM_TAB_TEMPLATES,
  CustomTabTemplate,
  CustomTabConfig,
  encodeCustomTabConfig,
  DEFAULT_CUSTOM_TAB_CONFIG,
} from "./types/customTab";
import { settingsStore } from "./lib/storage";

interface CustomTabWizardProps {
  onClose: () => void;
  onDone: () => void;
}

/**
 * Matey1.txt §3 — Custom Tab Setup Wizard.
 * Step 1: give the tab a name. Step 2: pick one of the four "out of the box"
 * customization templates. The result is persisted as a base64 config blob
 * (the same shape as the `matey://custom-tab?config=...` deep link).
 */
export const CustomTabWizard: React.FC<CustomTabWizardProps> = ({
  onClose,
  onDone,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [template, setTemplate] =
    useState<CustomTabTemplate>("knowledge-filter");

  const selectedMeta = CUSTOM_TAB_TEMPLATES.find((t) => t.value === template)!;

  const save = async () => {
    const config: CustomTabConfig = {
      ...DEFAULT_CUSTOM_TAB_CONFIG,
      id: template,
      name: name.trim() || selectedMeta.title,
      template,
      icon: selectedMeta.icon,
    };
    try {
      await settingsStore.setCustomTabConfig(
        true,
        encodeCustomTabConfig(config)
      );
      onDone();
    } catch (error) {
      console.error("Failed to persist custom tab config:", error);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 backdrop-blur">
      <div className="w-[90%] max-w-sm rounded-3xl border border-border-hard/10 bg-surface p-5 shadow-2xl">
        <header className="flex items-center justify-between">
          <h2 className="font-serif text-xl italic font-normal text-bg">
            Custom Tab
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border-hard/10 bg-transparent text-bg/60 hover:text-bg"
          >
            <X size={18} />
          </button>
        </header>

        {step === 1 && (
          <>
            <p className="mt-3 text-[11px] leading-relaxed text-bg/60">
              Give your dashboard a name. This becomes the label shown in the
              tab bar.
            </p>
            <input
              type="text"
              inputMode="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Project Alpha, Client Briefs…"
              className="mt-4 w-full rounded-xl border border-border-hard/10 bg-bg/5 px-3 py-2.5 text-[13px] text-bg outline-none placeholder:text-bg/30 focus:border-bg"
              maxLength={32}
            />
          </>
        )}

        {step === 2 && (
          <>
            <p className="mt-3 text-[11px] leading-relaxed text-bg/60">
              Pick an "out of the box" template for this tab:
            </p>
            <div className="mt-3 space-y-2">
              {CUSTOM_TAB_TEMPLATES.map((t) => {
                const active = template === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="radio"
                    aria-pressed={active}
                    aria-label={`Template: ${t.title}`}
                    onClick={() => setTemplate(t.value)}
                    className={`w-full rounded-xl border px-3 py-2.5 text-left transition-all ${
                      active
                        ? "border-bg bg-bg text-surface"
                        : "border-border-hard/10 bg-surface text-bg hover:bg-bg/5"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg" aria-hidden>
                        {t.icon}
                      </span>
                      <span className="text-[10px] font-black uppercase tracking-widest">
                        {t.title}
                      </span>
                    </div>
                    <p className="mt-0.5 text-[10px] text-bg/60">
                      {t.description}
                    </p>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <footer className="mt-5 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-full border border-border-hard/10 py-2 text-[10px] font-black uppercase tracking-widest text-bg/60 hover:text-bg"
          >
            Cancel
          </button>
          <button
            onClick={() => (step === 1 ? setStep(2) : save())}
            disabled={step === 1 ? name.trim().length === 0 : false}
            className={`flex-1 items-center justify-center gap-1 rounded-full py-2 text-[10px] font-black uppercase tracking-widest transition-all ${
              step === 1 && name.trim().length === 0
                ? "cursor-not-allowed border border-border-hard/10 text-bg/40"
                : "border border-bg bg-bg text-surface hover:border-bg"
            }`}
          >
            {step === 1 ? "Next" : "Create"}
          </button>
        </footer>
        <div className="mt-3 text-center">
          <span
            className="inline-flex items-center gap-1 text-[9px] uppercase tracking-widest text-bg/50"
            aria-hidden
          >
            <Sparkles size={10} />
            Matey • local-first
          </span>
        </div>
      </div>
    </div>
  );
};
