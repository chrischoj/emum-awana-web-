import { NavLink, Outlet } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { teacherNavItems } from '../config/navigation';
import { cn } from '../lib/utils';

export default function TeacherLayout() {
  const { teacher, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Top header */}
      <header className="sticky top-0 z-30 flex items-center justify-between h-14 px-4 bg-white border-b border-gray-200">
        <h1 className="text-lg font-bold text-indigo-600">어와나</h1>
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">{teacher?.name}</span>
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
