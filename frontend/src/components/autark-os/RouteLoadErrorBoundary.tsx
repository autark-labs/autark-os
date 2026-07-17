import { Component, type ErrorInfo, type ReactNode } from 'react';
import { PageLoadError } from '@/components/autark-os/PageLoadError';

type RouteLoadErrorBoundaryProps = {
  children: ReactNode;
  fullScreen?: boolean;
  pageName: string;
};

type RouteLoadErrorBoundaryState = {
  failed: boolean;
};

/** Keeps a stale or failed lazy-loaded page distinct from an intentional unknown route. */
export class RouteLoadErrorBoundary extends Component<RouteLoadErrorBoundaryProps, RouteLoadErrorBoundaryState> {
  state: RouteLoadErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): RouteLoadErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Autark-OS could not load ${this.props.pageName}.`, error, errorInfo);
  }

  componentDidUpdate(previousProps: RouteLoadErrorBoundaryProps) {
    if (this.state.failed && previousProps.pageName !== this.props.pageName) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) {
      return (
        <PageLoadError
          fullScreen={this.props.fullScreen}
          model={{
            actionLabel: 'Reload Autark-OS',
            message: 'The page files could not load. This can happen just after an update. Reload Autark-OS to try again.',
            title: `${this.props.pageName} could not load`,
          }}
          onRetry={() => globalThis.location.reload()}
        />
      );
    }

    return this.props.children;
  }
}
