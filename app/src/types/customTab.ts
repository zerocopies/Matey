export type CustomTabTemplate =
  | 'assistant'
  | 'knowledge-filter'
  | 'task-center'
  | 'connect-track';

export interface CustomTabConfig {
  id: string;
  name: string;
  template: CustomTabTemplate;
  icon: string;
  /** Template A — AI Assistant */
  role?: string;
  topic?: string;
  /** Template B — Knowledge Filter */
  tags?: string[];
  keywords?: string[];
  /** Template D — Connect & Track */
  webhookService?: string;
  webhookUrl?: string;
}

export interface CustomTabTemplateMeta {
  value: CustomTabTemplate;
  title: string;
  icon: string;
  description: string;
}

/** "Out of the box" customization templates (Matey1.txt §2). */
export const CUSTOM_TAB_TEMPLATES: CustomTabTemplateMeta[] = [
  {
    value: 'assistant',
    title: 'AI Assistant',
    icon: '💬',
    description:
      'A dedicated chat view distinct from the ambient Recap feed, with a custom role and topic focus.',
  },
  {
    value: 'knowledge-filter',
    title: 'Knowledge Filter',
    icon: '🔍',
    description:
      'A filtered RAG feed scoped to your tags and keywords — overrides the global profile.',
  },
  {
    value: 'task-center',
    title: 'Task & Priority Center',
    icon: '✅',
    description:
      'Scans your notes for [ ] tasks and !! priority flags, rendered as a clean, borderless list.',
  },
  {
    value: 'connect-track',
    title: 'Connect & Track',
    icon: '🔗',
    description:
      'Pings an external webhook via the silent // engine and renders the payload read-only.',
  },
];

export const DEFAULT_CUSTOM_TAB_CONFIG: CustomTabConfig = {
  id: 'custom-tab',
  name: 'Dashboard',
  template: 'knowledge-filter',
  icon: '💠',
};

/** Round-trips a config through the `matey://custom-tab?config={base64}` deep-link form. */
export function encodeCustomTabConfig(config: CustomTabConfig): string {
  return btoa(JSON.stringify(config));
}

export function decodeCustomTabConfig(blob: string): CustomTabConfig | null {
  try {
    return JSON.parse(atob(blob)) as CustomTabConfig;
  } catch {
    return null;
  }
}
