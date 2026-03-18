import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom';
import { LogOut, Menu, X, BookOpen } from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { adminNavSections } from '../config/navigation';
import { cn } from '../lib/utils';
import { Avatar } from './ui/Avatar';

export default function AdminLayout() {
  const { teacher, signOut } = useAuth();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed top-0 left-0 z-50 h-dvh w-64 flex flex-col bg-white border-r border-gray-200 transform transition-transform duration-200 lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200">
          <Link to="/admin" className="flex items-center gap-2">
            <img src="/eeum-logo.png" alt="이음교회" className="h-7 object-contain" />
            <h1 className="text-lg font-bold text-indigo-600">AWANA</h1>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1 rounded hover:bg-gray-100"
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
                    end={item.path === '/admin'}
                    onClick={() => setSidebarOpen(false)}
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

        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <button
              onClick={() => navigate('/teacher/profile')}
              className="flex items-center gap-1.5 hover:text-indigo-600 transition-colors"
            >
              <Avatar name={teacher?.name ?? ''} src={teacher?.avatar_url} size="sm" />
              <span className="text-sm text-gray-600 truncate">{teacher?.name ?? '관리자'}</span>
            </button>
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigate('/teacher')}
                className="p-2 text-gray-400 hover:text-indigo-500 rounded-lg hover:bg-gray-100"
                title="교사 페이지"
              >
                <BookOpen className="w-4 h-4" />
              </button>
              <button
                onClick={signOut}
                className="p-2 text-gray-400 hover:text-red-500 rounded-lg hover:bg-gray-100"
                title="로그아웃"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar (mobile) */}
        <header className="sticky top-0 z-30 flex items-center h-16 px-4 bg-white border-b border-gray-200 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-100"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Link to="/admin" className="ml-3 flex items-center gap-2">
            <img src="/eeum-logo.png" alt="이음교회" className="h-7 object-contain" />
            <h1 className="text-lg font-bold text-indigo-600">AWANA</h1>
          </Link>
        </header>

        <main className="p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
