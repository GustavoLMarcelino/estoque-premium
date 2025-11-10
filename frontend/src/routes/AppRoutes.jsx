import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import Login from '../pages/Login/Login';
import Layout from '../components/Layout/Layout';
import Home from '../pages/Home/Home';
import CadastroProduto from '../pages/CadastroProduto/CadastroProduto';
import Estoque from '../pages/Estoque/Estoque';
import LancamentoEntradaSaida from '../pages/LancamentoEntradaSaida/LancamentoEntradaSaida';
import RegistroMovimentacoes from '../pages/RegistroMovimentacoes/RegistroMovimentacoes';
import GarantiaCadastro from '../pages/Garantia/GarantiaCadastro';
import GarantiaLista from '../pages/GarantiaLista/GarantiaLista';
// Landing Premium importada 1:1 do Lovable
import PremiumWrapper from '../pages/Premium/PremiumWrapper';


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
  <Route path="garantia" element={<GarantiaCadastro/>} />
  <Route path="garantia-con" element={<GarantiaLista/>} />
</Route>


      {/* Landing pública Premium */}
      <Route path="/premium" element={<PremiumWrapper />} />

      {/* Fallback global */}
      <Route path="*" element={<Navigate to="/home" replace />} />
    </Routes>
  );
}
