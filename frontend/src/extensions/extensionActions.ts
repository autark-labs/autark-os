export async function extensionAction(
  apiBase: string,
  surface: string,
  actionId: string,
  payload: Record<string, unknown>,
): Promise<{ outcome: string; payload: Record<string, unknown> }> {
  const body = JSON.stringify({ schemaVersion: '1', surface, actionId, payload });
  if (new TextEncoder().encode(body).length > 16 * 1024) throw new Error('This action is too large.');
  const response = await fetch(`${apiBase}/actions`, {
    method: 'POST', credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-Autark-Extension-Action': '1' },
    body,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('Private guidance is temporarily unavailable. Try again.');
  const result = await response.json();
  if (result?.schemaVersion !== '1' || !['completed', 'conflict', 'not_found', 'invalid'].includes(result?.outcome)
      || !result.payload || typeof result.payload !== 'object' || Array.isArray(result.payload)) {
    throw new Error('Private guidance needs a compatible update.');
  }
  return result;
}
