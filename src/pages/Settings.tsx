import React from 'react';
import { supabase } from '../lib/supabase';
import toast from 'react-hot-toast';

const Settings = () => {
  return (
    <div className="container mx-auto px-4">
      <h1 className="text-2xl font-bold mb-8">설정</h1>
      <div className="bg-white shadow-md rounded-lg p-6">
        <p className="text-gray-600">설정 페이지입니다.</p>
      </div>
    </div>
  );
};

export default Settings;