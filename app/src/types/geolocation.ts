export type GeoSource = 'gps' | 'manual';

export type ManualRegionId =
  | 'north-america'
  | 'eu-corridor'
  | 'south-se-asia'
  | 'oceania'
  | 'global';

export interface GeoContext {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
  marketRegion: string;
  regulatoryLens: string;
  source: GeoSource;
}

export interface ManualRegionOption {
  id: ManualRegionId;
  label: string;
}
