import React from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { Users, Calendar, Package, Award, DollarSign, FileText, Settings } from 'lucide-react';

const Layout = () => {
  const location = useLocation();

  const navigation = [
    { name: 'Dashboard', href: '/', icon: Users },
    { name: 'Teacher Attendance', href: '/teacher-attendance', icon: Calendar },
    { name: 'Member Attendance', href: '/member-attendance', icon: Calendar },
    { name: 'Inventory', href: '/inventory', icon: Package },
    { name: 'Awards', href: '/awards', icon: Award },
    { name: 'Budget', href: '/budget', icon: DollarSign },
    { name: 'Reports', href: '/reports', icon: FileText },
    { name: 'Settings', href: '/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 bg-white shadow-md min-h-screen">
          <div className="p-4">
            {/* Remove logo_awana.png reference */}
            <h1 className="text-xl font-bold">Awana Club</h1>
          </div>
          <nav className="mt-4">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={`flex items-center px-4 py-2 text-sm ${
                    location.pathname === item.href
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="mr-3 h-5 w-5" />
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Main content */}
        <div className="flex-1 p-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
};

export default Layout;