export interface CulturePreferences {
  region: string;
  locale: string;
  cuisines: string[];
  dietaryNorms: string[];
  prohibitedIngredients: string[];
}

export interface GroomingProfile {
  faceShape: string | null;
  skinTone: string | null;
  hairTraits: string[];
  beardStyle: string | null;
  productPreferences: string[];
}

export interface WardrobeProfile {
  style: string[];
  favoriteColors: string[];
  categories: string[];
}

export interface KitchenProfile {
  servingSize: number;
  cookingSkill: "beginner" | "intermediate" | "advanced";
  likesLeftovers: boolean;
}

export interface DiscoveryProfile {
  opennessToFusion: number;
  triedCuisines: string[];
  lastTwist: string | null;
}

export interface UserProfile {
  version: number;
  updatedAt: string;
  name?: string;
  selfieUrl?: string;
  selfieUpdatedAt?: string;
  culture: CulturePreferences;
  grooming: GroomingProfile;
  wardrobe: WardrobeProfile;
  kitchen: KitchenProfile;
  discovery: DiscoveryProfile;
  onboardingCompleted: boolean;
}

export const DEFAULT_CULTURE: CulturePreferences = {
  region: "UAE",
  locale: "en-AE",
  cuisines: ["Emirati", "Levantine", "South Asian", "Indian"],
  dietaryNorms: ["halal"],
  prohibitedIngredients: ["pork", "alcohol"],
};

export function emptyProfile(): UserProfile {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    culture: { ...DEFAULT_CULTURE },
    grooming: {
      faceShape: null,
      skinTone: null,
      hairTraits: [],
      beardStyle: null,
      productPreferences: [],
    },
    wardrobe: {
      style: [],
      favoriteColors: [],
      categories: [],
    },
    kitchen: {
      servingSize: 2,
      cookingSkill: "intermediate",
      likesLeftovers: true,
    },
    discovery: {
      opennessToFusion: 0.5,
      triedCuisines: [],
      lastTwist: null,
    },
    onboardingCompleted: false,
  };
}

export type FridgeCategory =
  | "produce"
  | "meat"
  | "dairy"
  | "frozen"
  | "pantry"
  | "cooked";

export interface FridgeItem {
  id: string;
  name: string;
  category: FridgeCategory;
  quantity: string;
  addedAt: string;
  notes?: string;
}

export type SnapshotLogType =
  | "recipe"
  | "wardrobe"
  | "profile"
  | "fridge"
  | "discovery";

export interface SnapshotLog {
  id: string;
  type: SnapshotLogType;
  occurredAt: string;
  summary: string;
  payload?: unknown;
}

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";

export interface WornItemLog {
  name: string;
  category: string;
  style?: string;
  color?: string;
  imageUrl?: string;
}

export interface MealLog {
  type: MealType;
  name: string;
  cuisine?: string;
  usedIngredients?: string[];
}

export interface GeneratedLookLog {
  name: string;
  occasion?: string;
}

export interface DayActivity {
  wornItems: WornItemLog[];
  meals: MealLog[];
  kitchenEvents: string[];
  discoveries: string[];
  generatedLooks: GeneratedLookLog[];
}

export interface SnapshotDay {
  date: string;
  activity: DayActivity;
}

export const SNAPSHOT_WINDOW_DAYS = 3;

export function emptyDayActivity(): DayActivity {
  return {
    wornItems: [],
    meals: [],
    kitchenEvents: [],
    discoveries: [],
    generatedLooks: [],
  };
}

export type SnapTheme =
  | "minimal"
  | "cool-panda"
  | "true-dark";

export const THEME_OPTIONS: { value: SnapTheme; label: string; dot: string }[] = [
  { value: "minimal", label: "Minimal", dot: "bg-accent-primary" },
  { value: "cool-panda", label: "Cool Panda", dot: "bg-accent-primary" },
  { value: "true-dark", label: "True Dark", dot: "bg-accent-primary" },
];

export function isSnapTheme(value: string): value is SnapTheme {
  return [
    "minimal",
    "cool-panda",
    "true-dark",
  ].includes(value);
}

export interface SnapSettings {
  culinaryEnabled: boolean;
  styleEnabled: boolean;
  personalizationEnabled: boolean;
  memoryEnabled: boolean;
  privateMode: boolean;
  halalMode: boolean;
  theme: SnapTheme;
  /** Matey1.txt §3: "Navigation" → "Custom Tab" toggle. */
  customTabEnabled: boolean;
  /** Base64 config blob (`matey://custom-tab?config=...`), or null when unconfigured. */
  customTabConfig: string | null;
}

export const DEFAULT_SETTINGS: SnapSettings = {
  culinaryEnabled: true,
  styleEnabled: true,
  personalizationEnabled: true,
  memoryEnabled: true,
  privateMode: false,
  halalMode: false,
  theme: "minimal",
  customTabEnabled: false,
  customTabConfig: null,
};

export interface WardrobeGarment {
  id: string;
  name: string;
  category: string;
  color?: string;
  tags: string[];
  imageUrl?: string;
  notes?: string;
  capturedAt: string;
}
