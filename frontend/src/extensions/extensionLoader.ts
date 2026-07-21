export type ExtensionUiManifest = {
  schemaVersion: '1';
  extensionId: string;
  componentVersion: string;
  entrypoint: string;
  entrypointSha256: string;
  surfaces: string[];
};

export type ExtensionHostContext = {
  apiBase: string;
  element: HTMLElement;
  navigate: (routeId: string, actionId?: string) => void;
  surface: string;
};

export type ExtensionModule = {
  mount(context: ExtensionHostContext): Promise<void | (() => void)> | void | (() => void);
};

const moduleCache = new Map<string, Promise<ExtensionModule>>();

export async function discoverExtension(
  extensionId: string,
  surface: string,
): Promise<{ apiBase: string; module: ExtensionModule } | null> {
  const apiBase = `/api/v1/extensions/${encodeURIComponent(extensionId)}`;
  const response = await fetch(`${apiBase}/ui-manifest`, {
    credentials: 'same-origin',
    headers: { Accept: 'application/json' },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('The installed extension manifest is unavailable.');

  const manifest: unknown = await response.json();
  if (!isManifest(manifest, extensionId) || !manifest.surfaces.includes(surface)) return null;

  const entrypointUrl = `${apiBase}/assets/${encodeURIComponent(manifest.entrypoint)}?digest=${encodeURIComponent(manifest.entrypointSha256)}`;
  let modulePromise = moduleCache.get(entrypointUrl);
  if (!modulePromise) {
    modulePromise = import(/* @vite-ignore */ entrypointUrl).then((candidate: unknown) => {
      if (!isExtensionModule(candidate)) throw new Error('The extension entrypoint is invalid.');
      return candidate;
    });
    moduleCache.set(entrypointUrl, modulePromise);
    modulePromise.catch(() => moduleCache.delete(entrypointUrl));
  }
  return { apiBase, module: await modulePromise };
}

function isManifest(value: unknown, extensionId: string): value is ExtensionUiManifest {
  if (!value || typeof value !== 'object') return false;
  const manifest = value as Partial<ExtensionUiManifest>;
  return manifest.schemaVersion === '1'
    && manifest.extensionId === extensionId
    && typeof manifest.componentVersion === 'string'
    && /^[0-9]+\.[0-9]+\.[0-9]+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(manifest.componentVersion)
    && /^[a-zA-Z0-9._-]{1,128}$/.test(manifest.entrypoint ?? '')
    && /^sha256:[0-9a-f]{64}$/.test(manifest.entrypointSha256 ?? '')
    && Array.isArray(manifest.surfaces)
    && manifest.surfaces.length > 0
    && manifest.surfaces.length <= 32
    && manifest.surfaces.every((surface) => typeof surface === 'string'
      && /^[a-z][a-z0-9.-]{1,127}$/.test(surface))
    && new Set(manifest.surfaces).size === manifest.surfaces.length;
}

function isExtensionModule(value: unknown): value is ExtensionModule {
  return Boolean(
    value
    && typeof value === 'object'
    && typeof (value as Partial<ExtensionModule>).mount === 'function',
  );
}
