// src/App.jsx
import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

import Sidebar from './components/sidebar/sidebar';
import Home from './pages/Home/home';
import Estoque from './pages/Estoque/Estoque';
import EstoqueSom from './pages/EstoqueSom/EstoqueSom';
import Dashboards from './pages/Dashboards/Dashboards';
import Cadastro from './pages/CadastroProduto';
import TabelaPreco from './pages/TabelaPreco';
import EntradaSaida from './pages/LancamentoEntradaSaida';
import RegistroMovimentacoes from './pages/RegistroMovimentacoes/RegistroMovimentacoes';
import Garantia from './pages/Garantia';
import GarantiaLista from './pages/GarantiaLista';
import Login from './pages/Login/Login';

// ✅ Landing Premium
import PremiumWrapper from './pages/Premium/PremiumWrapper';

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

function isAuthed() {
  return !!localStorage.getItem('token');
}

function Protected({ children }) {
  return isAuthed() ? children : <Navigate to="/login" replace />;
}

function PublicOnly({ children }) {
  return isAuthed() ? <Navigate to="/home" replace /> : children;
}

function Logout() {
  useEffect(() => {
    localStorage.removeItem('usuarioLogado');
    localStorage.removeItem('token');
    window.location.replace('/login');
  }, []);
  return null;
}

function AppShell() {
  const { pathname } = useLocation();

  const isLogin = pathname === '/login';
  const isLanding = pathname === '/premium' || pathname.startsWith('/premium/');
  const hideChrome = isLogin || isLanding;

  useEffect(() => {
    const html = document.documentElement;
    if (isLanding) html.classList.add('landing-mode');
    else html.classList.remove('landing-mode');
  }, [isLanding]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  const contentClasses = ['content'];
  if (hideChrome) contentClasses.push('content--chromeless');
  if (isLogin) contentClasses.push('content--login');
  if (isLanding) contentClasses.push('content--landing');

  return (
    <div className="app">
      {!hideChrome && <Sidebar />}

      <div className={contentClasses.join(' ')}>
        <Routes>
          {/* 🔓 Públicas */}
          <Route path="/premium" element={<PremiumWrapper />} />
          <Route
            path="/login"
            element={
              <PublicOnly>
                <Login />
              </PublicOnly>
            }
          />
          <Route path="/logout" element={<Logout />} />

          {/* 🔒 Protegidas */}
          <Route path="/home" element={<Protected><Home /></Protected>} />

          <Route
            path="/estoque-baterias"
            element={
              <Protected>
                <RouteBoundary>
                  <Estoque />
                </RouteBoundary>
              </Protected>
            }
          />

          <Route
            path="/estoque-som"
            element={
              <Protected>
                <RouteBoundary>
                  <EstoqueSom />
                </RouteBoundary>
              </Protected>
            }
          />

          <Route
            path="/dashboards"
            element={
              <Protected>
                <RouteBoundary>
                  <Dashboards />
                </RouteBoundary>
              </Protected>
            }
          />

          <Route path="/cadastro" element={<Protected><Cadastro /></Protected>} />
          <Route path="/entrada-saida" element={<Protected><EntradaSaida /></Protected>} />
          <Route path="/tabela-precos" element={<Protected><TabelaPreco /></Protected>} />

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
          <Route path="/garantia" element={<Protected><Garantia /></Protected>} />
          <Route path="/garantia-con" element={<Protected><GarantiaLista /></Protected>} />

          {/* Compat antiga */}
          <Route path="/estoque" element={<Navigate to="/estoque-baterias" replace />} />

          {/* Raiz e 404 */}
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="*" element={<div style={{ padding: 16 }}>404 — Página não encontrada</div>} />
        </Routes>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
