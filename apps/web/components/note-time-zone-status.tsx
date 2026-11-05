import { Button } from "@parcelis/ui";

export function NoteTimeZoneStatus({
  timeZone,
  isError,
  isFetching,
  onRetry,
}: {
  timeZone: string | undefined;
  isError: boolean;
  isFetching: boolean;
  onRetry: () => void;
}) {
  if (timeZone) return null;

  if (isError) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-700" role="alert">
        <p>Unable to load note timestamps.</p>
        <Button disabled={isFetching} onClick={onRetry} size="sm" type="button" variant="secondary">
          {isFetching ? "Retrying…" : "Retry"}
        </Button>
      </div>
    );
  }

  return (
    <p className="text-sm text-parcelis-gray" role="status">
      Loading note timestamps…
    </p>
  );
}
