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

export type ExtensionLoadFailureKind = 'starting' | 'incompatible' | 'unhealthy' | 'unexpected';

export class ExtensionLoadError extends Error {
  readonly kind: ExtensionLoadFailureKind;

  constructor(kind: ExtensionLoadFailureKind) {
    super(kind);
    this.kind = kind;
  }
}

const moduleCache = new Map<string, Promise<ExtensionModule>>();

export async function discoverExtension(
  extensionId: string,
  surface: string,
  options: { signal?: AbortSignal } = {},
): Promise<{ apiBase: string; module: ExtensionModule } | null> {
  const apiBase = `/api/v1/extensions/${encodeURIComponent(extensionId)}`;
  let response: Response;
  try {
    response = await fetch(`${apiBase}/ui-manifest`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ExtensionLoadError('unhealthy');
  }
  if (response.status === 404) return null;
  if (!response.ok) throw new ExtensionLoadError(failureForStatus(response.status));

  let manifest: unknown;
  try {
    manifest = await response.json();
  } catch {
    throw new ExtensionLoadError('incompatible');
  }
  if (!isManifest(manifest, extensionId)) throw new ExtensionLoadError('incompatible');
  if (!manifest.surfaces.includes(surface)) return null;

  const entrypointUrl = `${apiBase}/assets/${encodeURIComponent(manifest.entrypoint)}?digest=${encodeURIComponent(manifest.entrypointSha256)}`;
  let modulePromise = moduleCache.get(entrypointUrl);
  if (!modulePromise) {
    modulePromise = import(/* @vite-ignore */ entrypointUrl)
      .then((candidate: unknown) => {
        if (!isExtensionModule(candidate)) throw new ExtensionLoadError('incompatible');
        return candidate;
      })
      .catch((error: unknown) => {
        if (error instanceof ExtensionLoadError) throw error;
        throw new ExtensionLoadError('unhealthy');
      });
    moduleCache.set(entrypointUrl, modulePromise);
    modulePromise.catch(() => moduleCache.delete(entrypointUrl));
  }
  return { apiBase, module: await modulePromise };
}

export function extensionLoadFailureKind(error: unknown): ExtensionLoadFailureKind {
  return error instanceof ExtensionLoadError ? error.kind : 'unexpected';
}

function failureForStatus(status: number): ExtensionLoadFailureKind {
  if (status === 409 || status === 412 || status === 422) return 'incompatible';
  if (status === 425 || status === 503) return 'starting';
  if (status === 502 || status === 504) return 'unhealthy';
  return 'unexpected';
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
