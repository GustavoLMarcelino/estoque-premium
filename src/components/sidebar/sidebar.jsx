// src/components/sidebar/Sidebar.jsx
import './Sidebar.css';
import { FaHome, FaBoxes, FaPlusSquare, FaExchangeAlt, FaChartLine, FaDollarSign } from 'react-icons/fa';
import { Link } from 'react-router-dom'; // IMPORTANTE: importar Link

export default function Sidebar() {
  return (
    <div className="sidebar">
      <div className="logo">⭐ Logo</div>
      <nav>
        <ul>
          <li className="active">
            <Link to="/" className="link">
              <FaHome /> <span>Home</span>
            </Link>
          </li>
          <li>
            <Link to="/estoque" className="link">
              <FaBoxes /> <span>Estoque</span>
            </Link>
          </li>
          <li>
            <Link to="/cadastro" className="link">
              <FaPlusSquare /> <span>Cadastro</span>
            </Link>
          </li>
          <li>
            <Link to="/entrada-saida" className="link">
              <FaExchangeAlt /> <span>Entrada e Saida</span>
            </Link>
          </li>
          <li>
            <Link to="/reg-movimentacao" className="link">
              <FaChartLine /> <span>Reg. Movimentacao</span>
            </Link>
          </li>
          <li>
            <Link to="/financeiro" className="link">
              <FaDollarSign /> <span>Financeiro</span>
            </Link>
          </li>
        </ul>
      </nav>
    </div>
  );
}
