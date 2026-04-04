/**
 * LoadingState -- Consistent full-page loading indicator.
 *
 * Usage:
 *   if (isLoading) return <LoadingState />;
 *   <LoadingState message="Fetching pipelines..." />
 */

interface LoadingStateProps {
  message?: string;
  className?: string;
}

export default function LoadingState({ message = "Loading...", className = "" }: LoadingStateProps) {
  return (
    <div className={`p-8 text-slate-400 text-sm ${className}`} aria-live="polite">
      {message}
    </div>
  );
}
