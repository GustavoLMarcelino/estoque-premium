// src/components/sidebar/Sidebar.jsx
import React from 'react';
import { FaHome, FaBoxes, FaPlusSquare, FaExchangeAlt, FaChartLine, FaDollarSign, FaSignOutAlt } from 'react-icons/fa';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuthState } from 'react-firebase-hooks/auth';
import { auth } from '../../firebase';
import Logo from '../../assets/logoSemFundo.png';
import './Sidebar.css';

export default function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [user]   = useAuthState(auth);

  const menuItems = [
    { path: '/',              icon: <FaHome />,         label: 'Home' },
    { path: '/estoque',       icon: <FaBoxes />,        label: 'Estoque' },
    { path: '/cadastro',      icon: <FaPlusSquare />,   label: 'Cadastro' },
    { path: '/entrada-saida', icon: <FaExchangeAlt />,  label: 'Entrada e Saída' },
    { path: '/reg-movimentacao', icon: <FaChartLine />,label: 'Reg. Movimentação' },
    //{ path: '/financeiro',    icon: <FaDollarSign />,   label: 'Financeiro' }
  ];

  const handleLogout = async () => {
    await auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <div className="sidebar">
      <div className="logo">
        <img src={Logo} alt="Logo" className="logo-image" />
      </div>

      <nav>
        <ul>
          {menuItems.map(item => (
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
        {user && (
          <div className="user-info">
            <div className="user-email" title={user.email}>
              {user.email}
            </div>
            <button
              className="logout-icon"
              onClick={handleLogout}
              title="Logout"
            >
              <FaSignOutAlt />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
