import { httpClient } from './httpClient';
import type { AutomationRecipe, AutomationRecipeUpdateRequest } from '@/types/automation';

export const AutomationAPIClient = {
  async recipes() {
    const response = await httpClient.get<AutomationRecipe[]>('/api/automation/recipes');
    return response.data;
  },

  async updateRecipe(recipeId: string, request: AutomationRecipeUpdateRequest) {
    const response = await httpClient.put<AutomationRecipe>(`/api/automation/recipes/${encodeURIComponent(recipeId)}`, request);
    return response.data;
  },
};
