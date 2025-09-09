import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/sidebar/sidebar';
import Home from './pages/Home';
import Estoque from './pages/Estoque/Estoque'; // ← garante que usa Estoque.jsx
import Cadastro from './pages/Cadastro/Cadastro';
import EntradaSaida from './pages/EntradaSaida/EntradaSaida';
import RegistroMovimentacoes from './pages/RegistroMovimentacoes/RegistroMovimentacoes';
import Login from './pages/Login/Login';
import React from 'react';

class RouteBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error('RouteBoundary capturou um erro:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16 }}>
          <h2>Ops, algo quebrou nesta página.</h2>
          <pre style={{ whiteSpace: 'pre-wrap' }}>{String(this.state.error)}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

function Protected({ children }) {
  const isAuth = !!localStorage.getItem('usuarioLogado');
  return isAuth ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <div className="app">
        <Sidebar />
        <div className="content">
          <Routes>
            <Route path="/login" element={<Login />} />

            <Route path="/home" element={<Protected><Home /></Protected>} />

            <Route
              path="/estoque"
              element={
                <Protected>
                  <RouteBoundary>
                    <Estoque />
                  </RouteBoundary>
                </Protected>
              }
            />

            <Route path="/cadastro" element={<Protected><Cadastro /></Protected>} />
            <Route path="/entrada-saida" element={<Protected><EntradaSaida /></Protected>} />

            <Route
              path="/reg-movimentacao"
              element={
                <Protected>
                  <RouteBoundary>
                    <RegistroMovimentacoes />
                  </RouteBoundary>
                </Protected>
              }
            />

            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="*" element={<div>404 — Página não encontrada</div>} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}
