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
    localStorage.removeItem('token');
    navigate('/login', { replace: true });
  };

  return (
    <div onClick={onClose} className="h-screen p-[20px_10px] shadow-[2px_0px_5px_rgba(0,0,0,0.05)] flex flex-col max-lg:w-[220px] w-[260px] bg-black text-white">
      <div className="text-center mb-[30px]">
        <img src={Logo} alt="Logo" className="w-full max-w-[180px] h-auto block m-[0px_auto] p-[0px_10px]"/>
      </div>

      <nav className="flex-1 overflow-y-auto">
        <ul className="list-none p-0 m-0">
          {items.map((it) => (
            <li key={it.to} className="flex items-center p-[10px_15px] text-[#ccc] rounded-[6px] mb-[10px] cursor-pointer transition-colors duration-[0.2s] hover:bg-[#e0e7ff] hover:text-[#000] active:bg-[#e0e7ff] active:text-[#000]">
              <NavLink
                to={it.to}
                end
                className={({ isActive }) => `!no-underline max-lg:text-sm !text-inherit flex items-center w-full h-[100%] hover:!text-[#fff] focus:!text-[#fff] ${isActive ? 'active' : ''}`}
              >
                {it.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-auto p-[10px] flex items-center justify-between border-t border-t-[rgba(255,255,255,0.1)]">
        <button className="bg-transparent border-none text-[#ccc] !text-[1.2rem] max-md:!text-[1rem] cursor-pointer p-[0px_4px] hover:text-white" onClick={logout}>
          Sair
        </button>
      </div>
    </div>
  );
}
