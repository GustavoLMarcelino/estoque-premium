// src/components/Layout/Layout.jsx
import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from '../sidebar/sidebar';
import './Layout.css';

export default function Layout() {
  const location = useLocation();

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="layout-content">
        <Outlet key={location.pathname} /> {/* <- Força re-render ao trocar de rota */}
      </main>
    </div>
  );
}
