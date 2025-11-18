import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import ResponsiveSidebar from '../sidebar/ResponsiveSidebar';

export default function Layout() {
  const location = useLocation();
  return (
    <div className="flex h-screen">
      <ResponsiveSidebar/>
      <main className="flex-1 overflow-y-auto p-[16px] bg-[#f4f4f4]">
        <Outlet key={location.pathname} />
      </main>
    </div>
  );
}
