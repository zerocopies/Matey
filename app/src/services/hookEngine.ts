import { SemanticHook, HookUpdate } from '../types/hooks';

const STORAGE_KEY = 'concierge_semantic_hooks';

export const getHooks = (): SemanticHook[] => {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored ? JSON.parse(stored) : [];
};

export const saveHooks = (hooks: SemanticHook[]): void => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(hooks));
};

export const addSemanticHook = (hook: Omit<SemanticHook, 'id' | 'createdAt' | 'isActive'>): SemanticHook => {
  const newHook: SemanticHook = {
    ...hook,
    id: Math.random().toString(36).substr(2, 9),
    createdAt: new Date().toISOString(),
    isActive: true
  };
  const hooks = getHooks();
  saveHooks([...hooks, newHook]);
  return newHook;
};

export const evaluateHooks = async (hooks: SemanticHook[]): Promise<HookUpdate[]> => {
  // Simulating background polling and condition evaluation
  const updates: HookUpdate[] = [];

  for (const hook of hooks) {
    // Randomly trigger an update for demo purposes (1 in 5 chance)
    if (Math.random() > 0.8) {
      updates.push({
        id: Math.random().toString(36).substr(2, 9),
        hookId: hook.id,
        hookName: hook.name,
        narrative: `Your hook for ${hook.name} has triggered: the observed ${hook.metric.toLowerCase()} has transitioned ${hook.bracket.toLowerCase()} than your target threshold of ${hook.threshold}. Cognitive synthesis suggests immediate action to leverage this shift.`,
        timestamp: new Date().toISOString()
      });
    }
  }

  return updates;
};
