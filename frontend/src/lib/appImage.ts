const catalogAppIdPattern = /^[a-z0-9][a-z0-9-]*$/;
const renderableImageUrlPattern = /^(?:\/|https?:\/\/|data:image\/)/i;

export function renderableAppImageUrl(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }

  const imageUrl = value.trim();
  return imageUrl && renderableImageUrlPattern.test(imageUrl) ? imageUrl : null;
}

export function catalogAppImageUrl(appId: unknown) {
  if (typeof appId !== 'string') {
    return null;
  }

  const catalogAppId = appId.trim();
  return catalogAppIdPattern.test(catalogAppId) ? `/app-images/${catalogAppId}.svg` : null;
}

export function preferredAppImageUrl(...candidates: unknown[]) {
  for (const candidate of candidates) {
    const imageUrl = renderableAppImageUrl(candidate);
    if (imageUrl) {
      return imageUrl;
    }
  }

  return null;
}
