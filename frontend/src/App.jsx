// src/App.jsx
import React, { useEffect, useState, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';

import Sidebar from './components/sidebar/sidebar';
import { AuthAPI, salvarSessao, getRole, temPermissao, temLinha, primeiraRotaPermitida } from './services/auth';
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
const TabelaPreco = lazy(() => import('./pages/TabelaPreco'));
const EntradaSaida = lazy(() => import('./pages/LancamentoEntradaSaida'));
const RegistroMovimentacoes = lazy(() => import('./pages/RegistroMovimentacoes/RegistroMovimentacoes'));
const Garantia = lazy(() => import('./pages/Garantia'));
const GarantiaLista = lazy(() => import('./pages/GarantiaLista'));
const BateriasEmprestadas = lazy(() => import('./pages/BateriasEmprestadas/BateriasEmprestadas'));
const Comissoes = lazy(() => import('./pages/Comissoes/PainelComissoes'));
const Usuarios = lazy(() => import('./pages/Usuarios/Usuarios'));
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

function SemAcesso() {
  return (
    <div style={{ padding: 24, color: '#475569' }}>
      <h2 style={{ marginBottom: 8 }}>Sem acesso</h2>
      <p>Seu usuário ainda não tem permissão para nenhuma tela. Fale com o administrador.</p>
    </div>
  );
}

/**
 * Gate de rota por permissão (UX apenas — o enforcement real é o backend):
 * - `perm`: exige a permissão de módulo (admin bypassa);
 * - `linha`: exige o escopo de linha ('baterias'|'som') ALÉM da permissão (AND);
 * - `adminOnly`: exige role=admin (telas administrativas);
 * - sem nada: basta estar logado.
 * Rota negada redireciona para a primeira tela permitida do usuário.
 */
function Protected({ perm, linha, adminOnly, children }) {
  if (!isAuthed()) return <Navigate to="/login" replace />;
  let allowed;
  if (adminOnly) allowed = getRole() === 'admin';
  else if (perm) allowed = temPermissao(perm) && (linha ? temLinha(linha) : true);
  else allowed = true;
  if (!allowed) {
    const destino = primeiraRotaPermitida();
    return destino ? <Navigate to={destino} replace /> : <SemAcesso />;
  }
  return children;
}

function PublicOnly({ children }) {
  return isAuthed() ? <Navigate to={primeiraRotaPermitida() || '/home'} replace /> : children;
}

function Logout() {
  useEffect(() => {
    localStorage.removeItem('usuarioLogado');
    localStorage.removeItem('token');
    localStorage.removeItem('role');
    localStorage.removeItem('permissoes');
    window.location.replace('/login');
  }, []);
  return null;
}

function AppShell() {
  const { pathname } = useLocation();
  // Ressincroniza role/permissões com o backend ao abrir o app: alterações
  // feitas pelo admin passam a valer na UI no próximo load, sem novo login.
  // (Sessões 401 são tratadas pelo interceptor do axios.)
  const [, setPermsVersion] = useState(0);
  useEffect(() => {
    if (!isAuthed()) return;
    AuthAPI.me()
      .then((u) => { salvarSessao(u); setPermsVersion((v) => v + 1); })
      .catch(() => {});
  }, []);

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

          {/* 🔒 Protegidas (perm = permissão de módulo; adminOnly = telas administrativas) */}
          <Route path="/home" element={<Protected perm="home"><Home /></Protected>} />

          <Route
            path="/estoque-baterias"
            element={
              <Protected perm="estoque_baterias" linha="baterias">
                <RouteBoundary>
                  <Estoque />
                </RouteBoundary>
              </Protected>
            }
          />

          <Route
            path="/estoque-som"
            element={
              <Protected perm="estoque_som" linha="som">
                <RouteBoundary>
                  <EstoqueSom />
                </RouteBoundary>
              </Protected>
            }
          />

          <Route
            path="/dashboards"
            element={
              <Protected perm="dashboards" linha="baterias">
                <RouteBoundary>
                  <Dashboards />
                </RouteBoundary>
              </Protected>
            }
          />

          <Route path="/orcamento" element={<Protected perm="orcamento" linha="som"><Orcamento /></Protected>} />
          <Route path="/cadastro" element={<Protected adminOnly><Cadastro /></Protected>} />
          <Route path="/usuarios" element={<Protected adminOnly><Usuarios /></Protected>} />
          <Route path="/entrada-saida" element={<Protected perm="entrada_saida"><EntradaSaida /></Protected>} />
          <Route path="/tabela-precos" element={<Protected perm="tabela_precos"><TabelaPreco /></Protected>} />
          <Route path="/comissoes" element={<Protected adminOnly><Comissoes /></Protected>} />

          <Route
            path="/reg-movimentacao"
            element={
              <Protected perm="reg_movimentacao">
                <RouteBoundary>
                  <RegistroMovimentacoes />
                </RouteBoundary>
              </Protected>
            }
          />
          <Route path="/garantia" element={<Protected perm="garantia" linha="baterias"><Garantia /></Protected>} />
          <Route path="/garantia/:id" element={<Protected perm="garantia" linha="baterias"><Garantia /></Protected>} />
          <Route path="/garantia-con" element={<Protected perm="consulta_garantia" linha="baterias"><GarantiaLista /></Protected>} />
          <Route path="/emprestimos" element={<Protected perm="emprestimos" linha="baterias"><BateriasEmprestadas /></Protected>} />

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
