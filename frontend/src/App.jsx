// src/App.jsx
import React, { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

import Sidebar from './components/sidebar/sidebar';
// Layout do shell (.app/.content): precisa estar no bundle de ENTRADA.
// Sem este import, o App.css só existia no chunk lazy da landing — quem
// entrava direto por /login ou outra rota ganhava o shell sem display:flex
// (conteúdo abaixo do sidebar).
import './App.css';

// Páginas em lazy: cada rota vira um chunk próprio — quem visita a landing
// não baixa o painel, e o Recharts (~150KB gzip) só carrega em /dashboards.
const Home = lazy(() => import('./pages/Home/home'));
const Estoque = lazy(() => import('./pages/Estoque/Estoque'));
const EstoqueSom = lazy(() => import('./pages/EstoqueSom/EstoqueSom'));
const Orcamento = lazy(() => import('./pages/Orcamento/Orcamento'));
const Dashboards = lazy(() => import('./pages/Dashboards/Dashboards'));
const Cadastro = lazy(() => import('./pages/CadastroProduto'));
const GerenciarClasses = lazy(() => import('./pages/GerenciarClasses/GerenciarClasses'));
const TabelaPreco = lazy(() => import('./pages/TabelaPreco'));
const EntradaSaida = lazy(() => import('./pages/LancamentoEntradaSaida'));
const RegistroMovimentacoes = lazy(() => import('./pages/RegistroMovimentacoes/RegistroMovimentacoes'));
const Garantia = lazy(() => import('./pages/Garantia'));
const GarantiaLista = lazy(() => import('./pages/GarantiaLista'));
const BateriasEmprestadas = lazy(() => import('./pages/BateriasEmprestadas/BateriasEmprestadas'));
const Comissoes = lazy(() => import('./pages/Comissoes/PainelComissoes'));
const Login = lazy(() => import('./pages/Login/Login'));
const EsqueciSenha = lazy(() => import('./pages/EsqueciSenha'));
const RedefinirSenha = lazy(() => import('./pages/RedefinirSenha'));
const PremiumWrapper = lazy(() => import('./pages/Premium/PremiumWrapper'));

// ✅ UI: notificações e confirmações
import { ToastProvider } from './components/ui/Toast';
import { ConfirmProvider } from './components/ui/ConfirmDialog';

function RouteFallback() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', color: '#94a3b8', fontSize: 14 }}>
      Carregando…
    </div>
  );
}

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
    localStorage.removeItem('role');
    window.location.replace('/login');
  }, []);
  return null;
}

function AppShell() {
  const { pathname } = useLocation();

  // Telas de autenticação compartilham o layout sem sidebar do login
  const isLogin = ['/login', '/esqueci-senha', '/redefinir-senha'].includes(pathname);
  const isLanding = pathname === '/';
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
  if (!hideChrome) contentClasses.push('content--app-shell');

  return (
    <div className="app">
      {!hideChrome && <Sidebar />}

      <div className={contentClasses.join(' ')}>
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* 🔓 Públicas */}
          <Route path="/" element={<PremiumWrapper />} />
          {/* Compat: link antigo /premium → raiz */}
          <Route path="/premium" element={<Navigate to="/" replace />} />
          <Route
            path="/login"
            element={
              <PublicOnly>
                <Login />
              </PublicOnly>
            }
          />
          <Route path="/logout" element={<Logout />} />
          <Route path="/esqueci-senha" element={<EsqueciSenha />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />

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

          <Route path="/orcamento" element={<Protected><Orcamento /></Protected>} />
          <Route path="/cadastro" element={<Protected><Cadastro /></Protected>} />
          <Route path="/classes-som" element={<Protected><GerenciarClasses /></Protected>} />
          <Route path="/entrada-saida" element={<Protected><EntradaSaida /></Protected>} />
          <Route path="/tabela-precos" element={<Protected><TabelaPreco /></Protected>} />
          <Route path="/comissoes" element={<Protected><Comissoes /></Protected>} />

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
          <Route path="/garantia/:id" element={<Protected><Garantia /></Protected>} />
          <Route path="/garantia-con" element={<Protected><GarantiaLista /></Protected>} />
          <Route path="/emprestimos" element={<Protected><BateriasEmprestadas /></Protected>} />

          {/* Compat antiga */}
          <Route path="/estoque" element={<Navigate to="/estoque-baterias" replace />} />

          {/* 404 */}
          <Route path="*" element={<div style={{ padding: 16 }}>404 — Página não encontrada</div>} />
        </Routes>
        </Suspense>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ConfirmProvider>
        <BrowserRouter>
          <AppShell />
        </BrowserRouter>
      </ConfirmProvider>
    </ToastProvider>
  );
}
