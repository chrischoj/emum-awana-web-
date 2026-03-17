import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ClubProvider } from './contexts/ClubContext';
import ProtectedRoute from './components/ProtectedRoute';
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
import AwardManagement from './pages/admin/AwardManagement';
import CeremonyPage from './pages/admin/CeremonyPage';
import RoomManagement from './pages/admin/RoomManagement';
import ReportsPage from './pages/admin/ReportsPage';
import SettingsPage from './pages/admin/SettingsPage';

// Teacher pages
import TeacherHome from './pages/teacher/TeacherHome';
import ScoringPage from './pages/teacher/ScoringPage';
import GameScoringPage from './pages/teacher/GameScoringPage';
import AttendancePage from './pages/teacher/AttendancePage';
import MemberProfilePage from './pages/teacher/MemberProfilePage';

// Role-based redirect component
function RoleRedirect() {
  const { session, role, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!session) return <Navigate to="/login" replace />;
  if (role === 'admin') return <Navigate to="/admin" replace />;
  return <Navigate to="/teacher" replace />;
}

function AppRoutes() {
  const { session } = useAuth();

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
          <Route path="/admin/awards" element={<AwardManagement />} />
          <Route path="/admin/ceremony" element={<CeremonyPage />} />
          <Route path="/admin/rooms" element={<RoomManagement />} />
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
          <Route path="/teacher/members/:id" element={<MemberProfilePage />} />
        </Route>
      </Route>

      {/* Catch-all */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <AuthProvider>
      <ClubProvider>
        <Router>
          <Toaster position="top-right" />
          <AppRoutes />
        </Router>
      </ClubProvider>
    </AuthProvider>
  );
}

export default App;
