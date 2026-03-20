interface SyncStatusIndicatorProps {
  pendingCount: number;
  isSyncing: boolean;
}

export function SyncStatusIndicator({ pendingCount, isSyncing }: SyncStatusIndicatorProps) {
  if (pendingCount === 0) return null;

  if (isSyncing) {
    return (
      <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
        <svg
          className="animate-spin h-3.5 w-3.5 text-blue-600"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
          />
        </svg>
        <span className="text-xs font-medium text-blue-700">동기화 중...</span>
      </div>
    );
  }

  return (
    <div className="mb-4 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
      <span className="text-xs font-medium text-amber-700">{pendingCount}건 저장 대기</span>
    </div>
  );
}
