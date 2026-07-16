export const blockingOverlayClassName = [
  'fixed inset-0 z-50 bg-slate-950/70',
  'duration-100',
  'data-open:animate-in data-open:fade-in-0',
  'data-closed:animate-out data-closed:fade-out-0',
  'motion-reduce:animate-none',
].join(' ');

export const blockingSurfaceMotionClassName = 'motion-reduce:animate-none motion-reduce:transition-none';
