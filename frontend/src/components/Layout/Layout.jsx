import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import './Layout.css';
import Sidebar from '../sidebar/sidebar'; // <-- minúsculo, bate com o arquivo

export default function Layout() {
  const location = useLocation();
  return (
    <div className="app-layout" style={{ display: 'flex' }}>
      <Sidebar />
      <main className="layout-content" style={{ flex: 1, padding: 16 }}>
        <Outlet key={location.pathname} />
      </main>
    </div>
  );
}
