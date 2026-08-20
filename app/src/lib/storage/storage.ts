import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

export interface StorageAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

class NativeStorage implements StorageAdapter {
  async get(key: string): Promise<string | null> {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  }

  async remove(key: string): Promise<void> {
    await Preferences.remove({ key });
  }
}

class WebStorage implements StorageAdapter {
  async get(key: string): Promise<string | null> {
    return window.localStorage.getItem(key);
  }

  async set(key: string, value: string): Promise<void> {
    window.localStorage.setItem(key, value);
  }

  async remove(key: string): Promise<void> {
    window.localStorage.removeItem(key);
  }
}

export function createStorageAdapter(): StorageAdapter {
  return Capacitor.isNativePlatform() ? new NativeStorage() : new WebStorage();
}

export class PrivacyController {
  private active = false;
  private overlay = new Map<string, string>();

  setActive(active: boolean): void {
    this.active = active;
    if (!active) {
      this.overlay.clear();
    }
  }

  isActive(): boolean {
    return this.active;
  }

  peek(key: string): string | null {
    return this.overlay.has(key) ? (this.overlay.get(key) ?? null) : null;
  }

  stage(key: string, value: string): void {
    this.overlay.set(key, value);
  }

  drop(key: string): void {
    this.overlay.delete(key);
  }
}

export const privacyController = new PrivacyController();

export function createPrivacyAwareStorageAdapter(): StorageAdapter {
  const base = createStorageAdapter();
  return {
    async get(key: string): Promise<string | null> {
      const staged = privacyController.peek(key);
      return staged !== null ? staged : base.get(key);
    },
    async set(key: string, value: string): Promise<void> {
      if (privacyController.isActive()) {
        privacyController.stage(key, value);
        return;
      }
      await base.set(key, value);
    },
    async remove(key: string): Promise<void> {
      if (privacyController.isActive()) {
        privacyController.drop(key);
        return;
      }
      await base.remove(key);
    },
  };
}

export async function readDocument<T>(
  storage: StorageAdapter,
  key: string,
  factory: () => T,
): Promise<T> {
  const raw = await storage.get(key);
  if (raw === null) {
    return factory();
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    const base = factory();
    if (Array.isArray(base) && Array.isArray(parsed)) {
      return [...base, ...parsed] as T;
    }
    return { ...(base as object), ...(parsed as object) } as T;
  } catch {
    console.warn(`[storage] corrupt document for key "${key}", resetting`);
    await storage.remove(key);
    return factory();
  }
}

export async function writeDocument<T>(
  storage: StorageAdapter,
  key: string,
  doc: T,
): Promise<void> {
  await storage.set(key, JSON.stringify(doc));
}
