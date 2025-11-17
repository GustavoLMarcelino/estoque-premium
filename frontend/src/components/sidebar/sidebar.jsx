// src/components/sidebar/sidebar.jsx
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import './sidebar.css';
import Logo from '../../assets/logoSemFundo.png';

export default function Sidebar() {
  const navigate = useNavigate();

  const items = [
    { to: '/home', label: 'Home' },
    { to: '/estoque-baterias', label: 'Estoque Baterias' },
    { to: '/estoque-som', label: 'Estoque Som' },
    { to: '/cadastro', label: 'Cadastro' },
    { to: '/tabela-precos', label: 'Tabela de Preços' },
    { to: '/entrada-saida', label: 'Entrada e Saída' },
    { to: '/reg-movimentacao', label: 'Reg. Movimentação' },
    { to: '/dashboards', label: 'Dashboards' },
    { to: '/garantia', label: 'Garantia' },
    { to: '/garantia-con', label: 'Consulta Garantia' },
  ];

  const logout = () => {
    localStorage.removeItem('usuarioLogado');
    navigate('/login', { replace: true });
  };

  return (
    <div className="sidebar">
      <div className="logo">
        <img src={Logo} alt="Logo" className="logo-image" />
      </div>

      <nav>
        <ul>
          {items.map((it) => (
            <li key={it.to}>
              <NavLink to={it.to} end className={({ isActive }) => `link ${isActive ? 'active' : ''}`}>
                {it.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar-footer">
        <button className="logout-icon" onClick={logout}>
          Sair
        </button>
      </div>
    </div>
  );
}
