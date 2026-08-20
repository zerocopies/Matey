export interface MonthlyTarget {
  id: string;
  title: string;
  deadline: string;
  status: 'pending' | 'in-progress' | 'completed';
}

export interface UserPersona {
  name: string;
  customTitle: string;
  profession: string;
  monthlyTargets: MonthlyTarget[];
}

export interface IntelligenceUpdate {
  id: string;
  title: string;
  source: string;
  timestamp: string;
  url: string;
  summary: string;
  whyItMatters: string;
  relatedTargetId?: string;
}
