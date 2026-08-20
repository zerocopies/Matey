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
    label: 'Minimal',
    surface: '#0F0F0F',
    surfaceElevated: '#141414',
    textPrimary: '#D8BE8A',
    textMuted: 'rgba(216, 190, 138, 0.64)',
    borderColor: '#3A3122',
    borderSoft: 'rgba(216, 190, 138, 0.20)',
    accentPrimary: '#D4AF37',
    accentSecondary: '#B8934A',
  },
  'cool-panda': {
    id: 'cool-panda',
    label: 'Cool Panda',
    surface: '#0E1012',
    surfaceElevated: '#15181B',
    textPrimary: '#CDBE9F',
    textMuted: 'rgba(205, 190, 159, 0.62)',
    borderColor: '#363A3F',
    borderSoft: 'rgba(205, 190, 159, 0.18)',
    accentPrimary: '#AFA58F',
    accentSecondary: '#7FA3A8',
  },
  'true-dark': {
    id: 'true-dark',
    label: 'True Dark',
    surface: '#000000',
    surfaceElevated: '#0D0D0D',
    textPrimary: '#FFFFFF',
    textMuted: 'rgba(255, 255, 255, 0.62)',
    borderColor: '#8f8f8f',
    borderSoft: 'rgba(255, 255, 255, 0.18)',
    accentPrimary: '#F92672',
    accentSecondary: '#AEFF0D',
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
