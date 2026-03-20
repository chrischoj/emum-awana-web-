import { useState } from 'react';
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { TeacherAssignmentProvider } from '../contexts/TeacherAssignmentContext';
import { BadgeRequestsProvider } from '../contexts/BadgeRequestsContext';
import { useAutoCheckIn } from '../hooks/useAutoCheckIn';
import { useSessionCleanup } from '../hooks/useSessionCleanup';
import { teacherNavItems, adminNavSections } from '../config/navigation';
import { cn } from '../lib/utils';
import { Avatar } from './ui/Avatar';
import { NotificationBell } from './NotificationBell';

export default function TeacherLayout() {
  const { teacher, role, signOut } = useAuth();
  useAutoCheckIn();
  useSessionCleanup();
  const navigate = useNavigate();
  const [adminSidebarOpen, setAdminSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      {/* Admin sidebar for admin users */}
      {role === 'admin' && adminSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setAdminSidebarOpen(false)} />
      )}
      {role === 'admin' && (
        <aside
          className={cn(
            'fixed top-0 left-0 z-50 h-dvh w-64 flex flex-col bg-white border-r border-gray-200 transform transition-transform duration-200',
            adminSidebarOpen ? 'translate-x-0' : '-translate-x-full'
          )}
        >
          <div className="flex items-center justify-between h-14 px-4 border-b border-gray-200">
            <span className="text-sm font-bold text-indigo-600">관리자 메뉴</span>
            <button
              onClick={() => setAdminSidebarOpen(false)}
              className="p-1 rounded hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <nav className="flex-1 px-2 py-4 overflow-y-auto">
            {adminNavSections.map((section, idx) => (
              <div key={idx} className={idx > 0 ? 'mt-4' : ''}>
                {section.title && (
                  <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
                    {section.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {section.items.map((item) => (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      onClick={() => setAdminSidebarOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-indigo-50 text-indigo-700'
                            : 'text-gray-700 hover:bg-gray-100'
                        )
                      }
                    >
                      <item.icon className="w-5 h-5 flex-shrink-0" />
                      {item.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
        </aside>
      )}
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
              onClick={() => setAdminSidebarOpen(true)}
              className="p-2 text-indigo-500 hover:text-indigo-700 rounded-lg"
              title="관리자 메뉴"
            >
              <Menu className="w-5 h-5" />
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
        <TeacherAssignmentProvider>
          <BadgeRequestsProvider>
            <Outlet />
          </BadgeRequestsProvider>
        </TeacherAssignmentProvider>
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
