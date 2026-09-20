import { jobTypeLabel as jobOperationLabel, queuedJobText } from '../repositories/jobRepository.logic';
import axios from 'axios';

const TERMINAL_ERROR_STATUSES = new Set(['failed', 'error']);
const INFO_STATUSES = new Set(['skipped', 'cancelled', 'canceled']);

type ActionNotificationSeverity = 'success' | 'info' | 'warning' | 'error' | 'critical' | string;

type ActionNotificationResult = {
  message?: string | null;
  ok?: boolean;
  severity?: ActionNotificationSeverity | null;
  status?: string | null;
  summary?: string | null;
  title?: string | null;
};

type ActionNotificationJobStep = {
  id?: string | null;
  label?: string | null;
  message?: string | null;
  status?: string | null;
};

type ActionNotificationJob = {
  currentStep?: string | null;
  error?: { message?: string | null } | null;
  steps?: ActionNotificationJobStep[];
  status?: string | null;
  subjectId?: string | null;
  type?: string | null;
};

type ErrorLike = {
  detail?: unknown;
  message?: unknown;
  title?: unknown;
};

export function actionNotificationFromResult(result: ActionNotificationResult = {}, fallbackTitle = 'Action finished') {
  const severity = normalizeSeverity(result);
  const title = result.title || fallbackTitle;
  const message = result.message || result.summary || '';
  return {
    severity,
    title,
    message,
    sticky: severity === 'warning' || severity === 'error' || severity === 'critical',
  };
}

export function actionNotificationFromError(error: unknown, fallbackTitle = 'Action failed') {
  const message = errorMessage(error);
  return {
    severity: 'error',
    title: fallbackTitle,
    message,
    sticky: true,
  };
}

export function actionNotificationFromJob(job: ActionNotificationJob = {}) {
  const type = job.type || '';
  const status = String(job.status || '').toLowerCase();
  const failed = status === 'failed';
  const succeeded = status === 'succeeded';
  const queued = status === 'queued';
  const cancelled = status === 'cancelled';
  const title = `${jobOperationLabel(type)} ${failed ? 'failed' : succeeded ? 'completed' : cancelled ? 'cancelled' : queued ? 'queued' : 'started'}`;
  const step = currentStep(job);
  const message = failed
    ? job.error?.message || `${jobOperationLabel(type)} could not finish.`
    : cancelled ? 'The queued operation was cancelled.' : queued
      ? queuedJobText(job)
      : step?.message || step?.label || (succeeded
        ? `${jobOperationLabel(type)}${job.subjectId ? ` for ${job.subjectId}` : ''} completed.`
        : jobSubjectMessage(job));
  const severity = failed ? 'error' : succeeded ? 'success' : 'info';
  return {
    severity,
    title,
    message,
    sticky: failed,
  };
}

function errorMessage(error: unknown) {
  if (axios.isAxiosError(error)) {
    const data: unknown = error.response?.data;
    if (data && typeof data === 'object' && 'message' in data && typeof data.message === 'string' && data.message.trim()) {
      return data.message;
    }
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string' && error.trim()) {
    return error;
  }
  if (error && typeof error === 'object') {
    const errorLike = error as ErrorLike;
    const maybeMessage = errorLike.message || errorLike.title || errorLike.detail;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage;
    }
  }
  return 'Autark-OS could not complete this action. Review diagnostics for details.';
}

export function notificationToastMethod(severity: ActionNotificationSeverity) {
  if (severity === 'success') return 'success';
  if (severity === 'info') return 'info';
  if (severity === 'warning') return 'warning';
  return 'error';
}

function currentStep(job: ActionNotificationJob) {
  return job?.steps?.find((step) => step.id === job.currentStep)
    || job?.steps?.find((step) => step.status === 'running')
    || null;
}

function jobSubjectMessage(job: ActionNotificationJob) {
  if (job?.subjectId && job.subjectId !== '__full__' && job.subjectId !== '__routine__') {
    return `${jobOperationLabel(job.type)} is running for ${job.subjectId}.`;
  }
  return `${jobOperationLabel(job.type)} is running.`;
}

function normalizeSeverity(result: ActionNotificationResult) {
  if (typeof result.severity === 'string' && result.severity) {
    return result.severity === 'critical' ? 'error' : result.severity;
  }
  if (result.ok === false) {
    return 'error';
  }
  const status = String(result.status || '').toLowerCase();
  if (TERMINAL_ERROR_STATUSES.has(status)) {
    return 'error';
  }
  if (INFO_STATUSES.has(status)) {
    return 'info';
  }
  return 'success';
}
