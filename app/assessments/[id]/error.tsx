'use client';
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="p-4 stack-sm">
      <h2 className="text-lg font-semibold text-gray-900">Something went wrong</h2>
      <p className="text-sm text-gray-700">{error.message}</p>
      <button className="btn-secondary w-fit" onClick={reset}>
        Try again
      </button>
    </div>
  );
}
