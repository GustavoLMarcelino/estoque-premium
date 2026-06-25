// src/components/sidebar/sidebar.jsx
import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  House, BatteryFull, Music, User, Tag, ArrowLeftRight,
  ClipboardList, BarChart3, ShieldCheck, Search, LogOut,
  Menu, X, ChevronLeft, ChevronRight,
} from 'lucide-react';
import './sidebar.css';
import Logo from '../../assets/LogoSemFundo.png';
import { useConfirm } from '../ui/ConfirmDialog';

const groups = [
  [
    { to: '/home', label: 'Home', icon: House },
  ],
  [
    { to: '/estoque-baterias', label: 'Estoque Baterias', icon: BatteryFull },
    { to: '/estoque-som',      label: 'Estoque Som',      icon: Music },
    { to: '/cadastro',         label: 'Cadastro',         icon: User },
    { to: '/tabela-precos',    label: 'Tabela de Preços', icon: Tag },
  ],
  [
    { to: '/entrada-saida',      label: 'Entrada e Saída',    icon: ArrowLeftRight },
    { to: '/reg-movimentacao',   label: 'Reg. Movimentação',  icon: ClipboardList },
    { to: '/dashboards',         label: 'Dashboards',         icon: BarChart3 },
  ],
  [
    { to: '/garantia',     label: 'Garantia',         icon: ShieldCheck },
    { to: '/garantia-con', label: 'Consulta Garantia', icon: Search },
  ],
];

function NavGroups({ collapsed, onItemClick }) {
  return (
    <nav className="sidebar-nav">
      {groups.map((items, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <div className="nav-divider" />}
          <ul>
            {items.map(({ to, label, icon: Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end
                  className={({ isActive }) =>
                    `nav-item${collapsed ? ' nav-item--icon' : ''}${isActive ? ' active' : ''}`
                  }
                  onClick={onItemClick}
                >
                  <Icon className="nav-icon" size={18} strokeWidth={2} />
                  {!collapsed && <span>{label}</span>}
                </NavLink>
                {collapsed && (
                  <div className="nav-tooltip" role="tooltip">{label}</div>
                )}
              </li>
            ))}
          </ul>
        </React.Fragment>
      ))}
    </nav>
  );
}

export default function Sidebar() {
  const navigate = useNavigate();
  const confirm = useConfirm();
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem('sidebarCollapsed') === 'true',
  );
  const [drawerOpen, setDrawerOpen] = useState(false);

  function toggleCollapsed() {
    setCollapsed((v) => {
      localStorage.setItem('sidebarCollapsed', String(!v));
      return !v;
    });
  }

  async function logout() {
    const ok = await confirm({
      title: 'Sair do sistema',
      message: 'Tem certeza que deseja sair?',
      confirmLabel: 'Sair',
      cancelLabel: 'Cancelar',
    });
    if (!ok) return;
    localStorage.removeItem('usuarioLogado');
    localStorage.removeItem('token');
    navigate('/login', { replace: true });
  }

  return (
    <>
      {/* ── ① Mobile topbar ─────────────────────────────── */}
      <header className="mobile-topbar">
        <button
          className="mobile-topbar__hamburger"
          onClick={() => setDrawerOpen(true)}
          aria-label="Abrir menu"
        >
          <Menu size={22} />
        </button>
        <img src={Logo} alt="Logo" className="mobile-topbar__logo" />
        {/* spacer keeps logo visually centered */}
        <div style={{ width: 34 }} aria-hidden />
      </header>

      {/* ── ② Mobile drawer ─────────────────────────────── */}
      {drawerOpen && (
        <div
          className="mobile-drawer-overlay"
          onClick={() => setDrawerOpen(false)}
        >
          <aside
            className="mobile-drawer"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mobile-drawer__header">
              <img src={Logo} alt="Logo" className="logo-image" style={{ maxWidth: 130 }} />
              <button
                className="mobile-drawer__close"
                onClick={() => setDrawerOpen(false)}
                aria-label="Fechar menu"
              >
                <X size={20} />
              </button>
            </div>

            <NavGroups collapsed={false} onItemClick={() => setDrawerOpen(false)} />

            <div className="sidebar-footer">
              <button
                className="logout-button"
                onClick={() => { logout(); setDrawerOpen(false); }}
              >
                <LogOut size={18} strokeWidth={2} />
                <span>Sair</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ── ③ Desktop / tablet sidebar ──────────────────── */}
      <aside className={`sidebar${collapsed ? ' sidebar--collapsed' : ''}`}>
        <div className="logo">
          <img
            src={Logo}
            alt="Logo"
            className={collapsed ? 'logo-icon-only' : 'logo-image'}
          />
        </div>

        <NavGroups collapsed={collapsed} />

        <div className="sidebar-footer">
          <button className="logout-button" onClick={logout}>
            <LogOut size={18} strokeWidth={2} />
            {!collapsed && <span>Sair</span>}
          </button>

          <button
            className="sidebar-toggle"
            onClick={toggleCollapsed}
            title={collapsed ? 'Expandir sidebar' : 'Recolher sidebar'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>
      </aside>
    </>
  );
}
