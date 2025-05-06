import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import Login                    from '../pages/Login/Login';
import PrivateRoute             from './PrivateRoute';
import Layout                   from '../components/Layout/Layout';
import Home                     from '../pages/Home/Home';
import CadastroProduto          from '../pages/CadastroProduto/CadastroProduto';
import Estoque                  from '../pages/Estoque/Estoque';
import LancamentoEntradaSaida   from '../pages/LancamentoEntradaSaida/LancamentoEntradaSaida';

export default function AppRoutes() {
  return (
    <Routes>
      {/* 1) Tela de Login isolada */}
      <Route path="/login" element={<Login />} />

      {/* 2) Raiz vai para login */}
      <Route path="/" element={<Navigate to="/login" replace />} />

      {/* 3) Todas as demais rotas ficam dentro do Layout e são protegidas */}
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index                element={<Home />} />
        <Route path="home"          element={<Home />} />
        <Route path="cadastro"      element={<CadastroProduto />} />
        <Route path="estoque"       element={<Estoque />} />
        <Route path="entrada-saida" element={<LancamentoEntradaSaida />} />
        {/* rota inválida dentro do layout volta pra Home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
