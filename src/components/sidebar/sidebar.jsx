// src/components/Sidebar.jsx
import './Sidebar.css';
import { FaHome, FaBoxes, FaPlusSquare, FaExchangeAlt, FaChartLine, FaDollarSign } from 'react-icons/fa';

export default function Sidebar() {
  return (
    <div className="sidebar">
      <div className="logo">⭐ Logo</div>
      <nav>
        <ul>
          <li className="active"><FaHome /> <span>Home</span></li>
          <li><FaBoxes /> <span>Estoque</span></li>
          <li><FaPlusSquare /> <span>Cadastro</span></li>
          <li><FaExchangeAlt /> <span>Entrada e Saida</span></li>
          <li><FaChartLine /> <span>Reg. Movimentacao</span></li>
          <li><FaDollarSign /> <span>Financeiro</span></li>
        </ul>
      </nav>
    </div>
  );
}
