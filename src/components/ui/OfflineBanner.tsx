interface OfflineBannerProps {
  pendingCount?: number;
}

export function OfflineBanner({ pendingCount }: OfflineBannerProps) {
  return (
    <div className="mb-4 p-3 bg-gray-800 rounded-lg flex items-center gap-2">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
      </span>
      <p className="text-sm text-white font-medium">
        오프라인 모드
        <span className="text-gray-400 font-normal ml-1.5">
          — 입력은 계속 가능합니다. 인터넷 연결 시 자동 저장됩니다.
        </span>
      </p>
      {pendingCount != null && pendingCount > 0 && (
        <span className="ml-auto text-xs bg-amber-500 text-white px-2 py-0.5 rounded-full font-medium">
          {pendingCount}건 대기
        </span>
      )}
    </div>
  );
}
