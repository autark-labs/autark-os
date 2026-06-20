const buttonStyles = {
  primary: 'bg-po-brand-gradient text-white shadow-po-brand-glow hover:brightness-110',
  quiet: 'border-po-border-strong bg-po-surface-inset text-po-text-secondary hover:bg-po-surface-hover hover:text-po-text',
  quietIcon: 'size-8 border-po-border-strong bg-po-surface-inset text-po-text-secondary hover:bg-po-surface-hover hover:text-po-text',
};

const cardStyles = {
  compact: 'rounded-lg border border-po-border bg-po-surface-inset p-3',
  normal: 'rounded-lg border border-po-border bg-po-surface-inset p-4',
  elevated: 'rounded-lg border border-po-border bg-po-surface shadow-po-panel',
};

export function poButtonClass(variant = 'quiet', className = '') {
  return joinClasses(buttonStyles[variant] || buttonStyles.quiet, className);
}

export function poNavItemClass(active, className = '') {
  return joinClasses(
    'flex min-h-16 items-start gap-3 rounded-lg px-3 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-300/70',
    active ? 'bg-po-brand-gradient text-white shadow-po-brand-glow' : 'text-po-text-muted hover:bg-po-surface-hover hover:text-po-text',
    className,
  );
}

export function poCardClass(density = 'normal', className = '') {
  return joinClasses(cardStyles[density] || cardStyles.normal, className);
}

function joinClasses(...values) {
  return values.filter(Boolean).join(' ');
}
