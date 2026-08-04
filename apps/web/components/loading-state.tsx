type LoadingStateProps = {
  className?: string;
  iconClassName?: string;
  label: string;
};

export function LoadingState({ className, iconClassName, label }: LoadingStateProps) {
  return (
    <div
      aria-live="polite"
      className={`flex min-h-48 items-center justify-center gap-3 text-sm font-medium text-parcelis-gray${className ? ` ${className}` : ""}`}
      role="status"
    >
      <img
        alt=""
        aria-hidden="true"
        className={`h-16 w-16${iconClassName ? ` ${iconClassName}` : ""}`}
        src="/brand/parcelis-loading-icon.svg"
      />
      <span>{label}</span>
    </div>
  );
}
