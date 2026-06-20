export type AutomationRecipeStatus = 'active' | 'preview' | 'unavailable' | string;

export type AutomationRecipe = {
  id: string;
  title: string;
  summary: string;
  trigger: string;
  action: string;
  safetyLimit: string;
  status: AutomationRecipeStatus;
  enabled: boolean;
  configurable: boolean;
  lastRun: string;
  lastResult: string;
  updatedAt: string;
};

export type AutomationRecipeUpdateRequest = {
  enabled: boolean;
};
