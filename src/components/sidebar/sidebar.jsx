// src/components/sidebar/Sidebar.jsx
import React from 'react';
import './Sidebar.css';
import { FaHome, FaBoxes, FaPlusSquare, FaExchangeAlt, FaChartLine, FaDollarSign, FaSignOutAlt } from 'react-icons/fa';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { auth } from '../../firebase';
import Logo from '../../assets/logoSemFundo.png';

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();

  const menuItems = [
    { path: '/', icon: <FaHome />, label: 'Home' },
    { path: '/estoque', icon: <FaBoxes />, label: 'Estoque' },
    { path: '/cadastro', icon: <FaPlusSquare />, label: 'Cadastro' },
    { path: '/entrada-saida', icon: <FaExchangeAlt />, label: 'Entrada e Saída' },
    { path: '/reg-movimentacao', icon: <FaChartLine />, label: 'Reg. Movimentação' },
    { path: '/financeiro', icon: <FaDollarSign />, label: 'Financeiro' }
  ];

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate('/login');
    } catch (error) {
      console.error('Erro ao fazer logout:', error);
    }
  };

  return (
    <div className="sidebar">
      <div className="logo">
        <img src={Logo} alt="Logo" className="logo-image" />
      </div>

      <nav>
        <ul>
          {menuItems.map((item) => (
            <li
              key={item.path}
              className={location.pathname === item.path ? 'active' : ''}
            >
              <Link to={item.path} className="link">
                {item.icon}
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="sidebar-footer">
        <button onClick={handleLogout} className="link logout-button">
          <FaSignOutAlt />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
