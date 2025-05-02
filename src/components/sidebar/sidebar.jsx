// src/components/sidebar/Sidebar.jsx
import './Sidebar.css';
import { FaHome, FaBoxes, FaPlusSquare, FaExchangeAlt, FaChartLine, FaDollarSign } from 'react-icons/fa';
import { Link, useLocation } from 'react-router-dom';
import Logo from '../../assets/logoSemFundo.png';


export default function Sidebar() {
  const location = useLocation();

  const menuItems = [
    { path: '/', icon: <FaHome />, label: 'Home' },
    { path: '/estoque', icon: <FaBoxes />, label: 'Estoque' },
    { path: '/cadastro', icon: <FaPlusSquare />, label: 'Cadastro' },
    { path: '/entrada-saida', icon: <FaExchangeAlt />, label: 'Entrada e Saida' },
    { path: '/reg-movimentacao', icon: <FaChartLine />, label: 'Reg. Movimentacao' },
    { path: '/financeiro', icon: <FaDollarSign />, label: 'Financeiro' }
  ];

  return (
    <div className="sidebar">
      <div className="logo">
      <img src={Logo} alt="Logo sem fundo.png" className="logo-image" />
      </div>
      <nav>
        <ul>
          {menuItems.map((item) => (
            <li key={item.path} className={location.pathname === item.path ? 'active' : ''}>
              <Link to={item.path} className="link">
                {item.icon}
                <span>{item.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
