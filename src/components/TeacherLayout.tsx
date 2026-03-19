import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { LogOut, Shield } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useAutoCheckIn } from '../hooks/useAutoCheckIn';
import { teacherNavItems } from '../config/navigation';
import { cn } from '../lib/utils';
import { Avatar } from './ui/Avatar';
import { NotificationBell } from './NotificationBell';

export default function TeacherLayout() {
  const { teacher, role, signOut } = useAuth();
  useAutoCheckIn();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Top header */}
      <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 bg-white border-b border-gray-200">
        <Link to="/teacher" className="flex items-center gap-2">
          <img src="/eeum-logo.png" alt="이음교회" className="h-7 object-contain" />
          <h1 className="text-lg font-bold text-indigo-600">AWANA</h1>
        </Link>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <button
            onClick={() => navigate('/teacher/profile')}
            className="flex items-center gap-1.5"
          >
            <Avatar name={teacher?.name ?? ''} src={teacher?.avatar_url} size="sm" />
            <span className="text-sm text-gray-600">{teacher?.name}</span>
          </button>
          {role === 'admin' && (
            <button
              onClick={() => navigate('/admin')}
              className="p-2 text-indigo-500 hover:text-indigo-700 rounded-lg"
              title="관리자 페이지"
            >
              <Shield className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={signOut}
            className="p-2 text-gray-400 hover:text-red-500 rounded-lg"
            title="로그아웃"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="p-4">
        <Outlet />
      </main>

      {/* Bottom tab bar (mobile optimized) */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-gray-200 safe-area-bottom">
        <div className="flex justify-around items-center h-16">
          {teacherNavItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/teacher'}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-1 px-3 py-2 min-w-[64px] rounded-lg transition-colors',
                  isActive
                    ? 'text-indigo-600'
                    : 'text-gray-500 hover:text-gray-700'
                )
              }
            >
              <item.icon className="w-5 h-5" />
              <span className="text-xs font-medium">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
