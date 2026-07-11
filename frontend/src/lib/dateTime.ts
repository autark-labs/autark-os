export function formatLocalizedDateTime(value: string | null | undefined, timeZone?: string | null, empty = 'Not recorded') {
  if (!value) return empty;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return empty;
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
      timeZone: timeZone || undefined,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat(undefined, {
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      month: 'short',
      timeZone: 'UTC',
    }).format(date);
  }
}

