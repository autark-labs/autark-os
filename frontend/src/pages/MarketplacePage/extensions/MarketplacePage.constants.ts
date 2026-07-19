export const categories = ['All', 'Featured', 'Media', 'Productivity', 'Security', 'Development', 'Home Automation', 'Network', 'Monitoring', 'Utilities'];

export const sortOptions = ['Recommended', 'Easiest to install', 'Recently updated'];

export const marketplaceStatusOptions = [
  { label: 'All statuses', value: 'all' },
  { label: 'Available', value: 'available' },
  { label: 'Installed', value: 'installed' },
  { label: 'Pinned', value: 'pinned' },
] as const;

export type MarketplaceStatusFilter = (typeof marketplaceStatusOptions)[number]['value'];
