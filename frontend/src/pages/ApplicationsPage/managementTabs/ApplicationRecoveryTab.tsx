import { Link } from 'react-router-dom';
import { DisabledAction } from '@/components/autark-os/DisabledAction';
import { Button } from '@/components/ui/button';
import type { ApplicationSurfaceItem } from '../extensions/ApplicationsPage.types';
import { applicationActionRestriction } from '../extensions/ApplicationsPage.operations';

type ApplicationRecoveryTabProps = {
  item: ApplicationSurfaceItem;
  onEditSettings: () => void;
  onReviewManagement: () => void;
};

export function ApplicationRecoveryTab({ item, onEditSettings, onReviewManagement }: ApplicationRecoveryTabProps) {
  if (item.operation.kind !== 'failed') return null;
  const settings = applicationActionRestriction(item, 'settings');
  const uninstall = applicationActionRestriction(item, 'uninstall');
  const operationRecovery = recoveryForOperation(item.operation.jobType);
  const recovery = operationRecovery ?? explainFailure(item.operation.message);
  const reviewUninstall = operationRecovery?.destination === 'overview';
  const restriction = reviewUninstall ? uninstall : settings;
  return (
    <section className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-5">
      <h3 className="font-semibold">{recovery.title}</h3>
      <p className="text-sm">{item.operation.message}</p>
      <p className="text-sm text-muted-foreground">{recovery.description}</p>
      {!operationRecovery && item.backup !== 'Protected' && <p className="text-sm text-muted-foreground">Repair preserves data when possible. Create a backup first if the app can safely run one.</p>}
      {operationRecovery?.destination === 'backups'
        ? <Button asChild size="sm" variant="outline"><Link to={`/backups?app=${encodeURIComponent(item.sourceId || item.id)}`}>Review backups and restore plan</Link></Button>
        : <DisabledAction disabled={restriction.disabled} reason={restriction.reason}>
          <Button disabled={restriction.disabled} onClick={reviewUninstall ? onReviewManagement : onEditSettings} size="sm" variant="outline">
            {reviewUninstall ? 'Review uninstall plan' : 'Review settings'}
          </Button>
        </DisabledAction>}
    </section>
  );
}

function recoveryForOperation(jobType?: string) {
  if (jobType === 'uninstall_app') return {
    title: 'Uninstall did not finish', destination: 'overview',
    description: 'Review the error for a checkpoint, permission or removal problem. Resolve that problem, then review a fresh uninstall plan in app management. Data may still be present; do not delete it manually.',
  };
  if (jobType === 'backup_restore') return {
    title: 'Review the restore result', destination: 'backups',
    description: 'The restore failed. A running app does not prove that the requested data was restored. Review the error and any safety checkpoint before reviewing a new restore plan.',
  };
  if (jobType === 'backup' || jobType === 'backup_verify') return {
    title: 'Review backup access and verification', destination: 'backups',
    description: 'Check the backup destination and the reported error, then retry the backup or verification in Backups. Starting or stopping the app does not resolve a failed backup.',
  };
  if (jobType === 'save_app_settings') return {
    title: 'Review the settings result', destination: 'settings',
    description: 'Review the error before retrying. If Autark-OS could not confirm recovery of the previous settings, use Repair in My Apps; do not uninstall the app.',
  };
  return null;
}

function explainFailure(message: string) {
  const lowerMessage = message.toLowerCase();
  const portMatch = message.match(/port\s+(?:0\.0\.0\.0:)?(\d+)/i) ?? message.match(/:(\d+)\/tcp/i);

  if (lowerMessage.includes('address already in use') || lowerMessage.includes('port is already in use')) {
    const portText = portMatch?.[1] ? ` ${portMatch[1]}` : '';
    return {
      title: `Port${portText} is already in use`,
      description: 'Another service is using the same local port. Change this app port in settings or stop the service using that port, then start the app again.',
    };
  }

  if (lowerMessage.includes('network') && lowerMessage.includes('external')) {
    return {
      title: 'Network ownership needs review',
      description: 'Docker found a network with the expected name that was not created for this app project. Review Diagnostics before retrying recovery.',
    };
  }

  if (lowerMessage.includes('ready') || lowerMessage.includes('reachable')) {
    return {
      title: 'App did not become reachable',
      description: 'The container command completed, but Autark-OS could not confirm the app endpoint is ready. Check settings and recent activity before retrying.',
    };
  }

  return {
    title: 'Last action failed',
    description: 'Use settings to correct app configuration, stop the app if it is stuck, or start it again after reviewing the recent activity.',
  };
}
