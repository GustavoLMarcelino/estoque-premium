import { Routes, Route } from 'react-router-dom';
import Home from '../pages/Home/Home';
import CadastroProduto from '../pages/CadastroProduto/CadastroProduto'; // IMPORTANTE importar CadastroProduto
import Estoque from '../pages/Estoque/Estoque';
import LancamentoEntradaSaida from '../pages/LancamentoEntradaSaida/LancamentoEntradaSaida';

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/cadastro" element={<CadastroProduto />} />
      <Route path="/estoque" element={<Estoque />} />
      <Route path="/entrada-saida" element={<LancamentoEntradaSaida />} />
      {/* Adicione outras rotas aqui depois */}
    </Routes>
  );
}
