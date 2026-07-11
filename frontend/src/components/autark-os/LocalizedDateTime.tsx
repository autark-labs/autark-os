import { formatLocalizedDateTime } from '@/lib/dateTime';

export type LocalizedDateTimeModel = {
  empty?: string;
  timeZone?: string | null;
  value: string | null | undefined;
};

export function LocalizedDateTime({ className, model }: { className?: string; model: LocalizedDateTimeModel }) {
  const label = formatLocalizedDateTime(model.value, model.timeZone, model.empty || 'Not recorded');
  if (!model.value || Number.isNaN(new Date(model.value).getTime())) {
    return <span className={className}>{label}</span>;
  }
  return <time className={className} dateTime={new Date(model.value).toISOString()}>{label}</time>;
}
