import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

const ROUTE_KEY = 'awana_last_route';
const SKIP_PATHS = ['/', '/login', '/signup'];

/**
 * PWA(홈 화면 추가) 모드에서 백그라운드 복귀 시
 * 마지막으로 보던 페이지로 자동 복원.
 *
 * - 경로 변경 시 localStorage에 저장
 * - 앱 시작 시 저장된 경로로 리다이렉트
 */
export function useRouteRestore() {
  const location = useLocation();

  // 경로 변경 시 저장 (로그인/루트 등은 제외)
  useEffect(() => {
    if (!SKIP_PATHS.includes(location.pathname)) {
      try {
        localStorage.setItem(ROUTE_KEY, location.pathname);
      } catch { /* ignore */ }
    }
  }, [location.pathname]);
}

/**
 * 저장된 마지막 경로를 반환하고 삭제.
 * RoleRedirect에서 1회 사용.
 */
export function consumeLastRoute(): string | null {
  try {
    const saved = localStorage.getItem(ROUTE_KEY);
    if (saved && !SKIP_PATHS.includes(saved)) {
      // 소비 후 삭제하지 않음 — 다음 백그라운드 kill에도 유효하도록
      return saved;
    }
  } catch { /* ignore */ }
  return null;
}

/** 로그아웃 시 저장된 경로 삭제 */
export function clearLastRoute() {
  try {
    localStorage.removeItem(ROUTE_KEY);
  } catch { /* ignore */ }
}
