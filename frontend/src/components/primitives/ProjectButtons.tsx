import { forwardRef, type ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  semanticDarkControlClass,
  semanticLightControlClass,
  semanticOpenActionClass,
  semanticPrimaryActionClass,
  semanticWarningActionClass,
} from './SemanticVariants';

type ButtonProps = ComponentProps<typeof Button>;

export const ProjectPrimaryButton = forwardRef<HTMLButtonElement, ButtonProps>(function ProjectPrimaryButton({ className, ...props }, ref) {
  return (
    <Button
      className={cn(semanticPrimaryActionClass, className)}
      ref={ref}
      {...props}
    />
  );
});

export const ProjectOpenButton = forwardRef<HTMLButtonElement, ButtonProps>(function ProjectOpenButton({ className, ...props }, ref) {
  return (
    <Button
      className={cn(semanticOpenActionClass, className)}
      ref={ref}
      {...props}
    />
  );
});

export const ProjectLightControlButton = forwardRef<HTMLButtonElement, ButtonProps>(function ProjectLightControlButton({ className, ...props }, ref) {
  return (
    <Button
      className={cn(semanticLightControlClass, className)}
      ref={ref}
      variant="outline"
      {...props}
    />
  );
});

export const ProjectDarkControlButton = forwardRef<HTMLButtonElement, ButtonProps>(function ProjectDarkControlButton({ className, ...props }, ref) {
  return (
    <Button
      className={cn(semanticDarkControlClass, className)}
      ref={ref}
      variant="outline"
      {...props}
    />
  );
});

export const ProjectWarningButton = forwardRef<HTMLButtonElement, ButtonProps>(function ProjectWarningButton({ className, ...props }, ref) {
  return (
    <Button
      className={cn(semanticWarningActionClass, className)}
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
