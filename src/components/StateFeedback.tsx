import React from "react";

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export function LoadingState({ message = "正在加载数据，请稍候...", className = "" }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex flex-col items-center justify-center p-12 text-center rounded-lg border border-slate-800 bg-slate-900/40 ${className}`}
    >
      <div className="w-full max-w-lg" aria-hidden="true"><div className="skeleton-line" /><div className="skeleton-line" /><div className="skeleton-line" /></div>
      <span className="text-sm font-medium text-slate-300 font-mono tracking-wide">{message}</span>
      <span className="sr-only">加载中</span>
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "数据加载失败",
  message,
  onRetry,
  className = "",
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={`flex flex-col items-center justify-center p-8 text-center rounded-lg border border-rose-800/80 bg-rose-950/30 ${className}`}
    >
      <div className="w-10 h-10 rounded-full bg-rose-950 border border-rose-600 flex items-center justify-center text-rose-400 mb-3 font-mono font-bold text-lg">
        ✕
      </div>
      <h3 className="text-base font-semibold text-rose-200 mb-1">{title}</h3>
      <p className="text-sm text-rose-300/90 max-w-md mb-4 font-mono">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="px-4 py-2 text-sm font-medium text-slate-100 bg-rose-900/80 hover:bg-rose-800 border border-rose-600 rounded-md transition-colors focus:ring-2 focus:ring-rose-500"
        >
          重试请求
        </button>
      )}
    </div>
  );
}

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  title = "暂无数据",
  description = "当前未检测到相关记录或暂无监控数据。",
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={`flex flex-col items-center justify-center p-12 text-center rounded-lg border border-dashed border-slate-800 bg-slate-900/20 ${className}`}
    >
      <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 mb-3 font-mono font-bold">
        ∅
      </div>
      <h3 className="text-sm font-semibold text-slate-200 mb-1">{title}</h3>
      <p className="text-xs text-slate-400 max-w-md mb-4">{description}</p>
      {action}
    </div>
  );
}
