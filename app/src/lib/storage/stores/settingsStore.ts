import type { StorageAdapter } from "../storage";
import { createStorageAdapter, readDocument, writeDocument } from "../storage";
import {
  DEFAULT_SETTINGS,
  isSnapTheme,
  type SnapSettings,
  type SnapTheme,
} from "../types";

const SETTINGS_KEY = "snap.settings";
const HALAL_PREF_KEY = "snap_preferences.halalMode";

export type SettingsToggle =
  | "culinaryEnabled"
  | "styleEnabled"
  | "personalizationEnabled"
  | "memoryEnabled"
  | "privateMode"
  | "halalMode"
  | "customTabEnabled";

export class SettingsStore {
  private current: SnapSettings | null = null;

  constructor(private storage: StorageAdapter) {}

  async hydrate(): Promise<SnapSettings> {
    const loaded = await readDocument(this.storage, SETTINGS_KEY, () => ({
      ...DEFAULT_SETTINGS,
    }));
    if (!isSnapTheme(loaded.theme)) {
      loaded.theme = "minimal";
    }
    this.current = { ...DEFAULT_SETTINGS, ...loaded };
    return this.current;
  }

  get(): SnapSettings {
    if (!this.current) {
      throw new Error("SettingsStore not hydrated; call hydrate() first");
    }
    return this.current;
  }

  async set(patch: Partial<SnapSettings>): Promise<SnapSettings> {
    const settings = { ...this.get(), ...patch };
    this.current = settings;
    await writeDocument(this.storage, SETTINGS_KEY, settings);
    if (patch.halalMode !== undefined) {
      await writeDocument(this.storage, HALAL_PREF_KEY, settings.halalMode);
    }
    return settings;
  }

  async isHalalMode(): Promise<boolean> {
    if (!this.current) {
      await this.hydrate();
    }
    return this.current!.halalMode;
  }

  async toggle(key: SettingsToggle): Promise<SnapSettings> {
    return this.set({ [key]: !this.get()[key] });
  }

    async setTheme(theme: SnapTheme): Promise<SnapSettings> {
    return this.set({ theme });
  }

  /** Matey1.txt §3 — persist the Custom Tab configuration (base64 blob). */
  async setCustomTabConfig(
    enabled: boolean,
    config: string | null,
  ): Promise<SnapSettings> {
    return this.set({ customTabEnabled: enabled, customTabConfig: config });
  }
}

export const settingsStore = new SettingsStore(createStorageAdapter());
