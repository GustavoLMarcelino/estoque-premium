import React, { useState } from 'react';
import './Estoque.css';

const initialProducts = [
  { id: 1, nome: 'Bateria 60AH', modelo: '60AH', custo: 250.00, valorVenda: 400.00, quantidadeMinima: 5, garantia: 12, quantidadeInicial: 10, entrada: 5, saida: 2 },
  { id: 2, nome: 'Bateria 45AH', modelo: '45AH', custo: 200.00, valorVenda: 320.00, quantidadeMinima: 4, garantia: 12, quantidadeInicial: 15, entrada: 10, saida: 5 },
  { id: 3, nome: 'Bateria 75AH', modelo: '75AH', custo: 350.00, valorVenda: 550.00, quantidadeMinima: 3, garantia: 24, quantidadeInicial: 5, entrada: 2, saida: 1 },
  { id: 4, nome: 'Bateria 150AH', modelo: '150AH', custo: 600.00, valorVenda: 900.00, quantidadeMinima: 2, garantia: 24, quantidadeInicial: 2, entrada: 1, saida: 0 },
  { id: 5, nome: 'Bateria 100AH', modelo: '100AH', custo: 450.00, valorVenda: 700.00, quantidadeMinima: 4, garantia: 12, quantidadeInicial: 8, entrada: 3, saida: 4 },
];

export default function Estoque() {
  const [produtos, setProdutos] = useState(initialProducts);
  const [filtroNome, setFiltroNome] = useState('');
  const [filtroModelo, setFiltroModelo] = useState('');

  const handleDelete = (id) => {
    setProdutos(produtos.filter((produto) => produto.id !== id));
  };

  const handleEdit = (id) => {
    alert(`Editar produto ID: ${id}`);
  };

  const produtosFiltrados = produtos.filter(produto => 
    produto.nome.toLowerCase().includes(filtroNome.toLowerCase()) &&
    produto.modelo.toLowerCase().includes(filtroModelo.toLowerCase())
  );

  return (
    <div className="estoque-page">
      <h2>Estoque de Produtos</h2>

      <div className="filtros">
        <input
          type="text"
          placeholder="Filtrar por nome do produto..."
          value={filtroNome}
          onChange={(e) => setFiltroNome(e.target.value)}
        />
        <input
          type="text"
          placeholder="Filtrar por modelo..."
          value={filtroModelo}
          onChange={(e) => setFiltroModelo(e.target.value)}
        />
      </div>

      <table className="estoque-tabela">
        <thead>
          <tr>
            <th>ID</th>
            <th>Produto</th>
            <th>Modelo</th>
            <th>Custo</th>
            <th>Valor Venda</th>
            <th>Qtd Min</th>
            <th>Garantia</th>
            <th>Qtd Inicial</th>
            <th>Entrada</th>
            <th>Saída</th>
            <th>Em Estoque</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {produtosFiltrados.map((produto) => {
            const emEstoque = produto.quantidadeInicial + produto.entrada - produto.saida;
            return (
              <tr key={produto.id}>
                <td>{produto.id}</td>
                <td>{produto.nome}</td>
                <td>{produto.modelo}</td>
                <td>R$ {produto.custo.toFixed(2)}</td>
                <td>R$ {produto.valorVenda.toFixed(2)}</td>
                <td>{produto.quantidadeMinima}</td>
                <td>{produto.garantia} meses</td>
                <td>{produto.quantidadeInicial}</td>
                <td>{produto.entrada}</td>
                <td>{produto.saida}</td>
                <td style={{ color: emEstoque <= 0 ? 'red' : emEstoque <= produto.quantidadeMinima ? 'orange' : 'green' }}>
                  {emEstoque}
                </td>
                <td>
                  <button onClick={() => handleEdit(produto.id)}>Editar</button>
                  <button onClick={() => handleDelete(produto.id)} className="btn-remove">Remover</button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
