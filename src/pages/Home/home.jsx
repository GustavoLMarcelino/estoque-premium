import React from 'react';
import './home.css';

export default function Home() {
  return (
    <div className="home-container">
      <h1 className="home-title">Bem-vindo ao Estoque Premium ⚡</h1>

      <div className="cards-container">
        <div className="card">
          <div className="card-icon">📦</div>
          <div className="card-content">
            <h3>Produtos em Estoque</h3>
            <p><strong>134 produtos</strong></p>
          </div>
        </div>

        <div className="card">
          <div className="card-icon">💲</div>
          <div className="card-content">
            <h3>Valor Total</h3>
            <p><strong>R$ 20.247,10</strong></p>
          </div>
        </div>

        <div className="card">
          <div className="card-icon">⚠️</div>
          <div className="card-content">
            <h3>Produtos Críticos</h3>
            <p><strong>5 itens</strong></p>
          </div>
        </div>

        <div className="card">
          <div className="card-icon">🛒</div>
          <div className="card-content">
            <h3>Vendas da Semana</h3>
            <p><strong>R$ 3.200,00</strong></p>
          </div>
        </div>
      </div>

      <div className="card-table full-width">
        <h3>📅 Últimas Movimentações</h3>
        <table className="movimentacoes-tabela">
          <thead>
            <tr>
              <th>Tipo</th>
              <th>Produto</th>
              <th>Quantidade</th>
              <th>Data</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Saída</td>
              <td>Bateria Moura</td>
              <td>2</td>
              <td>21/06</td>
            </tr>
            <tr>
              <td>Entrada</td>
              <td>Cabo 2m</td>
              <td>10</td>
              <td>20/06</td>
            </tr>
            <tr>
              <td>Saída</td>
              <td>Controlador 20A</td>
              <td>1</td>
              <td>19/06</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
