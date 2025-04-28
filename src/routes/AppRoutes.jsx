import { Routes, Route } from 'react-router-dom';
import Home from '../pages/Home/Home';
import CadastroProduto from '../pages/CadastroProduto/CadastroProduto'; // IMPORTANTE importar CadastroProduto

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/cadastro" element={<CadastroProduto />} />
      {/* Adicione outras rotas aqui depois */}
    </Routes>
  );
}
