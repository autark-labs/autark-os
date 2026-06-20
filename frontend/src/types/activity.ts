export type ActivityLog = {
  id: number;
  level: 'info' | 'success' | 'warning' | 'error' | string;
  category: 'install' | 'health' | 'repair' | 'access' | 'backup' | 'system' | 'api' | string;
  action: string;
  title: string;
  message: string;
  appId: string | null;
  outcome: 'completed' | 'failed' | 'needs_attention' | string;
  details: string;
  createdAt: string;
};

export type ActivityFilters = {
  level?: string;
  category?: string;
  outcome?: string;
  appId?: string;
  limit?: number;
};
