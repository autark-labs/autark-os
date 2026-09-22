import type { ReactNode } from 'react';
import { AppWindow } from 'lucide-react';
import { PageHeader } from '@/components/layout/PageHeader';

export function AppsPageHeader({ attentionCount, managedCount, children }: {
  children?: ReactNode;
  attentionCount: number | null;
  managedCount: number | null;
}) {
  return <PageHeader icon={AppWindow} title="My Apps" description="Open, manage, and monitor apps installed by Autark-OS." metrics={[
    { label: 'Managed apps', value: managedCount },
    { label: 'Needs review', value: attentionCount },
  ]}>{children}</PageHeader>;
}
