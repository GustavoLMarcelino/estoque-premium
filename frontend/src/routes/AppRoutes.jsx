import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import Login from '../pages/Login/Login';
import Layout from '../components/Layout/Layout';
import Home from '../pages/Home/Home';
import CadastroProduto from '../pages/CadastroProduto/CadastroProduto';
import Estoque from '../pages/Estoque/Estoque';
import LancamentoEntradaSaida from '../pages/LancamentoEntradaSaida/LancamentoEntradaSaida';
import RegistroMovimentacoes from '../pages/RegistroMovimentacoes/RegistroMovimentacoes';

export default function AppRoutes() {
  return (
    <Routes>
      {/* Login aberto */}
      <Route path="/login" element={<Login />} />

      {/* App com Layout (Sidebar + Outlet) */}
     // src/routes/AppRoutes.jsx
<Route path="/" element={<Layout />}>
  <Route index element={<Home />} />
  <Route path="home" element={<Home />} />
  <Route path="cadastro" element={<CadastroProduto />} />
  <Route path="estoque" element={<Estoque />} />
  <Route path="entrada-saida" element={<LancamentoEntradaSaida />} />
  <Route path="reg-movimentacao" element={<RegistroMovimentacoes />} />
</Route>


      {/* Fallback global */}
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
