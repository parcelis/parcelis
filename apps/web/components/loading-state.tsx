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
      <Image
        alt=""
        aria-hidden="true"
        className={`h-16 w-16${iconClassName ? ` ${iconClassName}` : ""}`}
        src="/brand/parcelis-loading-icon.svg"
        height={64}
        unoptimized
        width={64}
      />
      <span>{label}</span>
    </div>
  );
}
import Image from "next/image";
