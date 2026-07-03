import { forwardRef, type ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type ButtonProps = ComponentProps<typeof Button>;

export const ProjectPrimaryButton = forwardRef<HTMLButtonElement, ButtonProps>(function ProjectPrimaryButton({ className, ...props }, ref) {
  return (
    <Button
      className={cn('bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-500/20 hover:bg-cyan-200', className)}
      ref={ref}
      {...props}
    />
  );
});

export const ProjectOpenButton = forwardRef<HTMLButtonElement, ButtonProps>(function ProjectOpenButton({ className, ...props }, ref) {
  return (
    <Button
      className={cn('bg-cyan-300 text-slate-950 shadow-sm shadow-cyan-700/20 hover:bg-cyan-200', className)}
      ref={ref}
      {...props}
    />
  );
});

export const ProjectLightControlButton = forwardRef<HTMLButtonElement, ButtonProps>(function ProjectLightControlButton({ className, ...props }, ref) {
  return (
    <Button
      className={cn('border-sky-300 bg-white text-slate-950 hover:bg-sky-100', className)}
      ref={ref}
      variant="outline"
      {...props}
    />
  );
});

export const ProjectDarkControlButton = forwardRef<HTMLButtonElement, ButtonProps>(function ProjectDarkControlButton({ className, ...props }, ref) {
  return (
    <Button
      className={cn('border-sky-400/40 bg-slate-900 text-sky-50 hover:bg-slate-700 hover:text-white', className)}
      ref={ref}
      variant="outline"
      {...props}
    />
  );
});

export const ProjectWarningButton = forwardRef<HTMLButtonElement, ButtonProps>(function ProjectWarningButton({ className, ...props }, ref) {
  return (
    <Button
      className={cn('bg-orange-500 text-white shadow-md shadow-orange-700/20 hover:bg-orange-400', className)}
      ref={ref}
      {...props}
    />
  );
});

ProjectPrimaryButton.displayName = 'ProjectPrimaryButton';
ProjectOpenButton.displayName = 'ProjectOpenButton';
ProjectLightControlButton.displayName = 'ProjectLightControlButton';
ProjectDarkControlButton.displayName = 'ProjectDarkControlButton';
ProjectWarningButton.displayName = 'ProjectWarningButton';
