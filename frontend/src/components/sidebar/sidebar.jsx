// src/components/sidebar/sidebar.jsx
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  House, BatteryFull, Music, User, Tag, ArrowLeftRight,
  ClipboardList, BarChart3, ShieldCheck, Search, LogOut,
} from 'lucide-react';
import './sidebar.css';
import Logo from '../../assets/LogoSemFundo.png';

// Grupos preservam a ordem original; divisores finos separam cada bloco.
const groups = [
  [
    { to: '/home', label: 'Home', icon: House },
  ],
  [
    { to: '/estoque-baterias', label: 'Estoque Baterias', icon: BatteryFull },
    { to: '/estoque-som', label: 'Estoque Som', icon: Music },
    { to: '/cadastro', label: 'Cadastro', icon: User },
    { to: '/tabela-precos', label: 'Tabela de Preços', icon: Tag },
  ],
  [
    { to: '/entrada-saida', label: 'Entrada e Saída', icon: ArrowLeftRight },
    { to: '/reg-movimentacao', label: 'Reg. Movimentação', icon: ClipboardList },
    { to: '/dashboards', label: 'Dashboards', icon: BarChart3 },
  ],
  [
    { to: '/garantia', label: 'Garantia', icon: ShieldCheck },
    { to: '/garantia-con', label: 'Consulta Garantia', icon: Search },
  ],
];

export default function Sidebar() {
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem('usuarioLogado');
    localStorage.removeItem('token');
    navigate('/login', { replace: true });
  };

  return (
    <aside className="sidebar">
      <div className="logo">
        <img src={Logo} alt="Logo" className="logo-image" />
      </div>

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
                    className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                  >
                    <Icon className="nav-icon" size={18} strokeWidth={2} />
                    <span>{label}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </React.Fragment>
        ))}
      </nav>

      <div className="sidebar-footer">
        <button className="logout-button" onClick={logout}>
          <LogOut size={18} strokeWidth={2} />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  );
}
