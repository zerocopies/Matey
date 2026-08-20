export type MetricType = 'Price' | 'Time' | 'Size' | 'Weight' | 'Custom';
export type DirectionalBracket = 'Higher' | 'Lower' | 'Smaller' | 'Lighter';

export interface SemanticHook {
  id: string;
  name: string;
  url: string;
  metric: MetricType;
  bracket: DirectionalBracket;
  threshold: string;
  createdAt: string;
  isActive: boolean;
}

export interface HookUpdate {
  id: string;
  hookId: string;
  hookName: string;
  narrative: string;
  timestamp: string;
}
