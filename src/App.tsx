import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ClubProvider } from './contexts/ClubContext';
import { MemberProfileProvider } from './contexts/MemberProfileContext';
import ProtectedRoute from './components/ProtectedRoute';
import { useRouteRestore, consumeLastRoute } from './hooks/useRouteRestore';
import AdminLayout from './components/AdminLayout';
import TeacherLayout from './components/TeacherLayout';

// Public pages
import Login from './pages/Login';
import Signup from './pages/Signup';
import QRLandingPage from './pages/public/QRLandingPage';

// Admin pages
import DashboardPage from './pages/admin/DashboardPage';
import ScoringOverview from './pages/admin/ScoringOverview';
import GameScoresAdmin from './pages/admin/GameScoresAdmin';
import TeacherAttendancePage from './pages/admin/TeacherAttendancePage';
import MemberAttendancePage from './pages/admin/MemberAttendancePage';
import TeamManagement from './pages/admin/TeamManagement';
import MemberManagement from './pages/admin/MemberManagement';
import TeacherManagement from './pages/admin/TeacherManagement';
import AwardManagement from './pages/admin/AwardManagement';
import CeremonyPage from './pages/admin/CeremonyPage';
import CeremonyPlay from './pages/admin/CeremonyPlay';
import RoomManagement from './pages/admin/RoomManagement';
import ReportsPage from './pages/admin/ReportsPage';
import SettingsPage from './pages/admin/SettingsPage';
import HandbookManagement from './pages/admin/HandbookManagement';

// Member pages
import MemberLandingPage from './pages/MemberLandingPage';

// Teacher pages
import TeacherHome from './pages/teacher/TeacherHome';
import ScoringPage from './pages/teacher/ScoringPage';
import GameScoringPage from './pages/teacher/GameScoringPage';
import AttendancePage from './pages/teacher/AttendancePage';
import MemberProfilePage from './pages/teacher/MemberProfilePage';
import ProfilePage from './pages/teacher/ProfilePage';
import HandbookPage from './pages/teacher/HandbookPage';

// Role-based redirect component
function RoleRedirect() {
  const { session, role, loading } = useAuth();
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    if (!loading) { setShowFallback(false); return; }
    const timer = setTimeout(() => setShowFallback(true), 5000);
    return () => clearTimeout(timer);
  }, [loading]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          {showFallback && (
            <div className="text-center">
              <p className="text-sm text-gray-500 mb-3">로딩이 오래 걸리고 있습니다</p>
              <div className="flex gap-2">
                <button
                  onClick={() => { window.location.href = '/admin'; }}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
                >
                  관리자 페이지
                </button>
                <button
                  onClick={() => { window.location.href = '/teacher'; }}
                  className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100"
                >
                  교사 페이지
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;

  // PWA 복원: 저장된 마지막 경로가 있으면 해당 페이지로 이동
  const lastRoute = consumeLastRoute();
  if (lastRoute) {
    // role에 맞는 경로인지 간단 검증
    const isAdmin = role === 'admin';
    const isTeacher = role === 'admin' || role === 'teacher';
    const isMember = role === 'member';
    const routeValid =
      (lastRoute.startsWith('/admin') && isAdmin) ||
      (lastRoute.startsWith('/teacher') && isTeacher) ||
      (lastRoute.startsWith('/member') && isMember);
    if (routeValid) return <Navigate to={lastRoute} replace />;
  }

  if (role === 'admin') return <Navigate to="/admin" replace />;
  if (role === 'member') return <Navigate to="/member" replace />;
  return <Navigate to="/teacher" replace />;
}

function AppRoutes() {
  const { session } = useAuth();
  useRouteRestore(); // 현재 경로를 localStorage에 지속 저장

  return (
    <Routes>
      {/* Public routes */}
      <Route path="/login" element={!session ? <Login /> : <RoleRedirect />} />
      <Route path="/signup" element={!session ? <Signup /> : <RoleRedirect />} />
      <Route path="/qr/:roomId" element={<QRLandingPage />} />

      {/* Role-based root redirect */}
      <Route path="/" element={<RoleRedirect />} />

      {/* Admin routes */}
      <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
        <Route element={<AdminLayout />}>
          <Route path="/admin" element={<DashboardPage />} />
          <Route path="/admin/scoring" element={<ScoringOverview />} />
          <Route path="/admin/game-scores" element={<GameScoresAdmin />} />
          <Route path="/admin/attendance/teacher" element={<TeacherAttendancePage />} />
          <Route path="/admin/attendance/member" element={<MemberAttendancePage />} />
          <Route path="/admin/teams" element={<TeamManagement />} />
          <Route path="/admin/members" element={<MemberManagement />} />
          <Route path="/admin/teachers" element={<TeacherManagement />} />
          <Route path="/admin/awards" element={<AwardManagement />} />
          <Route path="/admin/ceremony" element={<CeremonyPage />} />
          <Route path="/admin/ceremony-play" element={<CeremonyPlay />} />
          <Route path="/admin/rooms" element={<RoomManagement />} />
          <Route path="/admin/handbook" element={<HandbookManagement />} />
          <Route path="/admin/reports" element={<ReportsPage />} />
          <Route path="/admin/settings" element={<SettingsPage />} />
        </Route>
      </Route>

      {/* Teacher routes (admin + teacher can access) */}
      <Route element={<ProtectedRoute allowedRoles={['admin', 'teacher']} />}>
        <Route element={<TeacherLayout />}>
          <Route path="/teacher" element={<TeacherHome />} />
          <Route path="/teacher/scoring" element={<ScoringPage />} />
          <Route path="/teacher/game" element={<GameScoringPage />} />
          <Route path="/teacher/attendance" element={<AttendancePage />} />
          <Route path="/teacher/handbook" element={<HandbookPage />} />
          <Route path="/teacher/members/:id" element={<MemberProfilePage />} />
          <Route path="/teacher/profile" element={<ProfilePage />} />
        </Route>
      </Route>

      {/* Member route */}
      <Route path="/member" element={
        session ? <MemberLandingPage /> : <Navigate to="/login" replace />
      } />

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <ClubProvider>
        <MemberProfileProvider>
          <Router>
            <Toaster position="top-right" />
            <AppRoutes />
          </Router>
        </MemberProfileProvider>
      </ClubProvider>
    </AuthProvider>
  );
}

export default App;
