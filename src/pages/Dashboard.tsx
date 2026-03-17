import { useState, useEffect } from 'react';
import { Users, Award, DollarSign } from 'lucide-react';
import { supabase } from '../lib/supabase';

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalMembers: 0,
    totalTeachers: 0,
    totalAwards: 0,
    budgetUsage: 0
  });

  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Fetch total members
        const { count: membersCount } = await supabase
          .from('members')
          .select('*', { count: 'exact' });

        // Fetch total teachers
        const { count: teachersCount } = await supabase
          .from('teachers')
          .select('*', { count: 'exact' });

        // Fetch total awards
        const { count: awardsCount } = await supabase
          .from('awards')
          .select('*', { count: 'exact' });

        // Fetch budget usage
        const { data: budgets } = await supabase
          .from('budgets')
          .select('amount, remaining')
          .single();

        setStats({
          totalMembers: membersCount ?? 0,
          totalTeachers: teachersCount ?? 0,
          totalAwards: awardsCount ?? 0,
          budgetUsage: budgets ? ((budgets.amount - budgets.remaining) / budgets.amount) * 100 : 0
        });
      } catch (error) {
        console.error('Error fetching dashboard stats:', error);
      }
    };

    fetchStats();
  }, []);

  const statCards = [
    {
      title: '총 클럽원',
      value: stats.totalMembers,
      icon: Users,
      color: 'bg-blue-500'
    },
    {
      title: '총 교사',
      value: stats.totalTeachers,
      icon: Users,
      color: 'bg-green-500'
    },
    {
      title: '시상 현황',
      value: stats.totalAwards,
      icon: Award,
      color: 'bg-purple-500'
    },
    {
      title: '예산 사용률',
      value: `${stats.budgetUsage.toFixed(1)}%`,
      icon: DollarSign,
      color: 'bg-yellow-500'
    }
  ];

  return (
    <div className="container mx-auto px-4">
      <h1 className="text-2xl font-bold mb-8">대시보드</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {statCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className="bg-white rounded-lg shadow-md p-6 flex items-center"
            >
              <div className={`${stat.color} p-4 rounded-lg mr-4`}>
                <Icon className="h-6 w-6 text-white" />
              </div>
              <div>
                <p className="text-gray-600 text-sm">{stat.title}</p>
                <p className="text-2xl font-bold">{stat.value}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Dashboard;