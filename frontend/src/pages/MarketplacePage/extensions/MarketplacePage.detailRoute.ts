export function marketplaceDetailId(searchParams: URLSearchParams) {
  return searchParams.get('detail') || null;
}

export function marketplaceSearchWithDetail(searchParams: URLSearchParams, appId: string) {
  const next = new URLSearchParams(searchParams);
  next.set('detail', appId);
  return next;
}

export function marketplaceSearchWithoutDetail(searchParams: URLSearchParams, clearRecovery = false) {
  const next = new URLSearchParams(searchParams);
  next.delete('detail');
  if (clearRecovery) {
    next.delete('app');
    next.delete('mode');
  }
  return next;
}
