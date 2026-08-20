import { GeoContext, ManualRegionId, ManualRegionOption } from '../types/geolocation';

const EARTH_RADIUS_M = 6371000;

export const MANUAL_REGION_OPTIONS: ManualRegionOption[] = [
  { id: 'north-america', label: 'North America' },
  { id: 'eu-corridor', label: 'EU Urban Corridor' },
  { id: 'south-se-asia', label: 'South & Southeast Asia' },
  { id: 'oceania', label: 'Oceania' },
  { id: 'global', label: 'Global Baseline' },
];

interface RegionSeed {
  latitude: number;
  longitude: number;
  marketRegion: string;
  regulatoryLens: string;
}

const REGION_SEEDS: Record<ManualRegionId, RegionSeed> = {
  'north-america': {
    latitude: 39.5,
    longitude: -98.35,
    marketRegion: 'North America',
    regulatoryLens: 'US/Canada posture: fragmented federal-state regulatory variability',
  },
  'eu-corridor': {
    latitude: 50.11,
    longitude: 8.68,
    marketRegion: 'EU urban corridor',
    regulatoryLens: 'EU-style compliance posture: stronger privacy and market safety controls likely',
  },
  'south-se-asia': {
    latitude: 13.75,
    longitude: 100.5,
    marketRegion: 'South & Southeast Asia',
    regulatoryLens: 'High-growth region: policy can evolve quickly with sector-specific constraints',
  },
  oceania: {
    latitude: -33.86,
    longitude: 151.21,
    marketRegion: 'Oceania',
    regulatoryLens: 'Mixed jurisdiction posture: validate local rules before execution',
  },
  global: {
    latitude: 0,
    longitude: 0,
    marketRegion: 'Global baseline market',
    regulatoryLens: 'Mixed jurisdiction posture: validate local rules before execution',
  },
};

const inferMarketRegion = (latitude: number, longitude: number) => {
  const hemisphere = latitude >= 0 ? 'Northern' : 'Southern';
  if (latitude > 35 && longitude > -15 && longitude < 45) return 'EU urban corridor';
  if (latitude > 24 && latitude < 50 && longitude < -66 && longitude > -130) return 'North America';
  if (latitude > -10 && latitude < 30 && longitude > 65 && longitude < 150) return 'South & Southeast Asia';
  if (latitude < -10 && longitude > 110 && longitude < 180) return 'Oceania';
  return `${hemisphere} regional market`;
};

const inferRegulatoryLens = (latitude: number, longitude: number) => {
  if (latitude > 35 && longitude > -15 && longitude < 45) {
    return 'EU-style compliance posture: stronger privacy and market safety controls likely';
  }
  if (latitude > 24 && latitude < 50 && longitude < -66 && longitude > -130) {
    return 'US/Canada posture: fragmented federal-state regulatory variability';
  }
  if (latitude > -10 && latitude < 30 && longitude > 65 && longitude < 150) {
    return 'High-growth region: policy can evolve quickly with sector-specific constraints';
  }
  return 'Mixed jurisdiction posture: validate local rules before execution';
};

const degreesToRadians = (degrees: number) => (degrees * Math.PI) / 180;

const distanceMeters = (
  latitudeA: number,
  longitudeA: number,
  latitudeB: number,
  longitudeB: number,
): number => {
  const deltaLatitude = degreesToRadians(latitudeB - latitudeA);
  const deltaLongitude = degreesToRadians(longitudeB - longitudeA);
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(degreesToRadians(latitudeA)) *
      Math.cos(degreesToRadians(latitudeB)) *
      Math.sin(deltaLongitude / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a));
};

export const toGeoContext = (coords: GeolocationCoordinates): GeoContext => {
  const marketRegion = inferMarketRegion(coords.latitude, coords.longitude);
  const regulatoryLens = inferRegulatoryLens(coords.latitude, coords.longitude);

  return {
    latitude: coords.latitude,
    longitude: coords.longitude,
    accuracy: coords.accuracy,
    capturedAt: new Date().toISOString(),
    marketRegion,
    regulatoryLens,
    source: 'gps',
  };
};

export const manualRegionToGeoContext = (regionId: ManualRegionId): GeoContext => {
  const seed = REGION_SEEDS[regionId];

  return {
    latitude: seed.latitude,
    longitude: seed.longitude,
    accuracy: 50000,
    capturedAt: new Date().toISOString(),
    marketRegion: seed.marketRegion,
    regulatoryLens: `${seed.regulatoryLens} (manual region override)`,
    source: 'manual',
  };
};

interface GeoWatchOptions {
  distanceThresholdMeters?: number;
  debounceMs?: number;
  maximumAgeMs?: number;
  timeoutMs?: number;
}

const DEFAULT_WATCH_OPTIONS: Required<GeoWatchOptions> = {
  distanceThresholdMeters: 250,
  debounceMs: 15000,
  maximumAgeMs: 5 * 60 * 1000,
  timeoutMs: 10000,
};

export const watchGeoContext = (
  onUpdate: (context: GeoContext) => void,
  onError?: (error: GeolocationPositionError) => void,
  options?: GeoWatchOptions,
): (() => void) => {
  if (!navigator.geolocation) {
    return () => {};
  }

  const effectiveOptions = { ...DEFAULT_WATCH_OPTIONS, ...options };

  let lastContext: GeoContext | null = null;
  let lastEmitAt = 0;

  const watchId = navigator.geolocation.watchPosition(
    (position) => {
      const nextContext = toGeoContext(position.coords);
      const now = Date.now();

      if (!lastContext) {
        lastContext = nextContext;
        lastEmitAt = now;
        onUpdate(nextContext);
        return;
      }

      const movedMeters = distanceMeters(
        lastContext.latitude,
        lastContext.longitude,
        nextContext.latitude,
        nextContext.longitude,
      );
      const elapsed = now - lastEmitAt;

      if (
        movedMeters >= effectiveOptions.distanceThresholdMeters ||
        elapsed >= effectiveOptions.debounceMs
      ) {
        lastContext = nextContext;
        lastEmitAt = now;
        onUpdate(nextContext);
      }
    },
    (error) => onError?.(error),
    {
      enableHighAccuracy: false,
      maximumAge: effectiveOptions.maximumAgeMs,
      timeout: effectiveOptions.timeoutMs,
    },
  );

  return () => navigator.geolocation.clearWatch(watchId);
};
