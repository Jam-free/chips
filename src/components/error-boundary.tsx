'use client';

import React from 'react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full bg-card rounded-lg shadow-lg p-6">
            <h1 className="text-xl font-bold text-red-600 mb-4">出错了</h1>
            <p className="text-sm text-muted-foreground mb-4">
              应用遇到了一个错误。请刷新页面重试。
            </p>
            {this.state.error && (
              <details className="text-xs bg-muted p-3 rounded mb-4">
                <summary className="cursor-pointer font-medium mb-2">错误详情</summary>
                <pre className="whitespace-pre-wrap break-words text-red-600">
                  {this.state.error.message}
                </pre>
              </details>
            )}
            <button
              onClick={() => window.location.reload()}
              className="w-full bg-primary text-primary-foreground py-2 rounded-md hover:opacity-90"
            >
              刷新页面
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
