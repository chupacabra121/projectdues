/**
 * Root Suspense fallback. Shown while a route's server data is loading — kept
 * minimal and chrome-free so it reads as a brief pause, not a new layout.
 */
export default function Loading() {
  return (
    <div className="flex flex-1 items-center justify-center p-10">
      <div className="flex items-center gap-3 text-muted-foreground">
        <span className="breathe h-2.5 w-2.5 rounded-full bg-primary" />
        <span className="text-sm">Loading…</span>
      </div>
    </div>
  );
}
