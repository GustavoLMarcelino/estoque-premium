import React, { useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { Button } from '@mui/material';
import './Estoque.css';

const initialProducts = [
  { id: 1, nome: 'Chic', quantidadeInicial: 0, entrada: 0, saida: 0, custo: 100, valorVenda: 150 },
  { id: 2, nome: 'Kenton', quantidadeInicial: 1, entrada: 1, saida: 1, custo: 200, valorVenda: 250 },
  { id: 3, nome: 'Evelina', quantidadeInicial: 2, entrada: 2, saida: 2, custo: 300, valorVenda: 350 },
  { id: 4, nome: 'Lexis', quantidadeInicial: 3, entrada: 3, saida: 3, custo: 400, valorVenda: 500 },
  { id: 5, nome: 'Kenton', quantidadeInicial: 4, entrada: 4, saida: 4, custo: 500, valorVenda: 700 },
];

export default function Estoque() {
  const [produtos, setProdutos] = useState(initialProducts);

  const handleDelete = (id) => {
    setProdutos(produtos.filter((produto) => produto.id !== id));
  };

  const handleEdit = (id) => {
    alert(`Editar produto ID: ${id}`);
  };

  const columns = [
    { field: 'id', headerName: 'ID', width: 70 },
    { field: 'nome', headerName: 'Produto', width: 200, sortable: true },
    { field: 'quantidadeInicial', headerName: 'Qtd Inicial', width: 120, sortable: true },
    { field: 'entrada', headerName: 'Entrada', width: 120, sortable: true },
    { field: 'saida', headerName: 'Saída', width: 120, sortable: true },
    {
      field: 'emEstoque',
      headerName: 'Em Estoque',
      width: 150,
      sortable: true,
      valueGetter: (params) =>
        params.row.quantidadeInicial + params.row.entrada - params.row.saida,
      renderCell: (params) => {
        const value = params.value;
        const color = value <= 0 ? 'red' : value <= 3 ? 'orange' : 'green';
        return (
          <strong style={{ color }}>
            {value}
          </strong>
        );
      },
    },
    {
      field: 'custo',
      headerName: 'Custo',
      width: 120,
      sortable: true,
      valueGetter: (params) => `R$ ${params.row.custo.toFixed(2)}`
    },
    {
      field: 'valorVenda',
      headerName: 'Valor Venda',
      width: 150,
      sortable: true,
      valueGetter: (params) => `R$ ${params.row.valorVenda.toFixed(2)}`
    },
    {
      field: 'lucro',
      headerName: '% Lucro',
      width: 120,
      sortable: true,
      valueGetter: (params) => {
        const custo = params.row.custo;
        const venda = params.row.valorVenda;
        if (custo === 0) return '0%';
        const lucro = ((venda - custo) / custo) * 100;
        return `${lucro.toFixed(1)}%`;
      },
      renderCell: (params) => {
        const value = parseFloat(params.value);
        const color = value < 0 ? 'red' : 'green';
        return (
          <strong style={{ color }}>
            {params.value}
          </strong>
        );
      },
    },
    {
      field: 'acoes',
      headerName: 'Ações',
      width: 200,
      renderCell: (params) => (
        <>
          <Button variant="contained" color="primary" size="small" onClick={() => handleEdit(params.row.id)}>
            Editar
          </Button>
          <Button
            variant="contained"
            color="error"
            size="small"
            className="remover-button"
            onClick={() => handleDelete(params.row.id)}
          >
            Remover
          </Button>
        </>
      ),
    },
  ];

  return (
    <div className="estoque-page">
      <h2>Estoque de Produtos</h2>
      <div className="estoque-tabela">
        <DataGrid
          rows={produtos}
          columns={columns}
          pageSize={5}
          rowsPerPageOptions={[5]}
          checkboxSelection
          disableSelectionOnClick
        />
      </div>
    </div>
  );
}
