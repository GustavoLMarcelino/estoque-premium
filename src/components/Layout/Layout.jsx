// src/components/Layout/Layout.jsx
import React from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from '../sidebar/sidebar';
import './Layout.css';

export default function Layout() {
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="layout-content">
        <Outlet />
      </main>
    </div>
  );
}
