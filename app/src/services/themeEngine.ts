export type ThemePresetId =
  | 'minimal'
  | 'cool-panda'
  | 'true-dark';

export interface ThemePreset {
  id: ThemePresetId;
  label: string;
  surface: string;
  surfaceElevated: string;
  textPrimary: string;
  textMuted: string;
  borderColor: string;
  borderSoft: string;
  accentPrimary: string;
  accentSecondary: string;
}

export const THEME_STORAGE_KEY = 'matey.theme.preset';
export const DEFAULT_THEME_PRESET_ID: ThemePresetId = 'minimal';

export const THEME_PRESET_ORDER: ThemePresetId[] = [
  'minimal',
  'cool-panda',
  'true-dark',
];

export const THEME_PRESETS: Record<ThemePresetId, ThemePreset> = {
  'minimal': {
    id: 'minimal',
    label: 'Minimal (OLED)',
    surface: '#0e0e11',
    surfaceElevated: '#16161a',
    textPrimary: '#FFFFFF',
    textMuted: 'rgba(158, 158, 169, 0.72)',
    borderColor: '#23232a',
    borderSoft: 'rgba(255, 255, 255, 0.12)',
    accentPrimary: '#8B5CF6',
    accentSecondary: '#A78BFA',
  },
  'cool-panda': {
    id: 'cool-panda',
    label: 'Cool Panda (OLED)',
    surface: '#0e0e11',
    surfaceElevated: '#16161a',
    textPrimary: '#FFFFFF',
    textMuted: 'rgba(158, 158, 169, 0.72)',
    borderColor: '#23232a',
    borderSoft: 'rgba(255, 255, 255, 0.12)',
    accentPrimary: '#8B5CF6',
    accentSecondary: '#A78BFA',
  },
  'true-dark': {
    id: 'true-dark',
    label: 'True Dark (OLED)',
    surface: '#000000',
    surfaceElevated: '#0e0e11',
    textPrimary: '#FFFFFF',
    textMuted: 'rgba(158, 158, 169, 0.72)',
    borderColor: '#23232a',
    borderSoft: 'rgba(255, 255, 255, 0.12)',
    accentPrimary: '#8B5CF6',
    accentSecondary: '#34D399',
  },
};

const isThemePresetId = (value: string): value is ThemePresetId => {
  return Object.prototype.hasOwnProperty.call(THEME_PRESETS, value);
};

const hexToRgbTriplet = (hexColor: string, fallback: string) => {
  const hex = hexColor.replace('#', '');
  if (hex.length !== 6) {
    return fallback;
  }
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  if (Number.isNaN(red) || Number.isNaN(green) || Number.isNaN(blue)) {
    return fallback;
  }
  return `${red} ${green} ${blue}`;
};

export const getStoredThemePresetId = (): ThemePresetId => {
  if (typeof window === 'undefined') {
    return DEFAULT_THEME_PRESET_ID;
  }
  const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_THEME_PRESET_ID;
  }
  return isThemePresetId(raw) ? raw : DEFAULT_THEME_PRESET_ID;
};

export const persistThemePresetId = (themeId: ThemePresetId) => {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(THEME_STORAGE_KEY, themeId);
};

export const applyThemePreset = (themeId: ThemePresetId) => {
  if (typeof document === 'undefined') {
    return;
  }

  const preset = THEME_PRESETS[themeId] ?? THEME_PRESETS[DEFAULT_THEME_PRESET_ID];
  const root = document.documentElement;

  root.style.setProperty('--theme-surface', preset.surface);
  root.style.setProperty('--theme-surface-elevated', preset.surfaceElevated);
  root.style.setProperty('--theme-fg', preset.textPrimary);
  root.style.setProperty('--theme-fg-muted', preset.textMuted);
  root.style.setProperty('--theme-border', preset.borderColor);
  root.style.setProperty('--theme-border-soft', preset.borderSoft);
  root.style.setProperty('--theme-accent-primary', preset.accentPrimary);
  root.style.setProperty('--theme-accent-secondary', preset.accentSecondary);
  root.style.setProperty('--bg-primary-rgb', hexToRgbTriplet(preset.textPrimary, '210 176 114'));
  root.style.setProperty('--bg-surface-rgb', hexToRgbTriplet(preset.surface, '15 15 15'));
  root.setAttribute('data-theme-preset', preset.id);
};

export const activateThemePreset = (themeId: ThemePresetId) => {
  persistThemePresetId(themeId);
  applyThemePreset(themeId);
};

export const bootstrapThemePreset = () => {
  applyThemePreset(getStoredThemePresetId());
};

export const getNextThemePresetId = (current: ThemePresetId): ThemePresetId => {
  const index = THEME_PRESET_ORDER.indexOf(current);
  if (index === -1) {
    return DEFAULT_THEME_PRESET_ID;
  }
  return THEME_PRESET_ORDER[(index + 1) % THEME_PRESET_ORDER.length];
};
