import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';

export default function PrivateRoute({ children }) {
  const location = useLocation();

  let usuarioLogado = null;
  try {
    usuarioLogado = JSON.parse(localStorage.getItem('usuarioLogado') || 'null');
  } catch {
    usuarioLogado = null;
  }

  if (!usuarioLogado) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return children;
}
