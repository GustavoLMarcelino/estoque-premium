import React, { useState } from 'react';
import { DataGrid } from '@mui/x-data-grid';
import { Button } from '@mui/material';

const initialProducts = [
  { id: 1, nome: 'Chic', quantidadeInicial: 0, entrada: 0, saida: 0 },
  { id: 2, nome: 'Kenton', quantidadeInicial: 1, entrada: 1, saida: 1 },
  { id: 3, nome: 'Evelina', quantidadeInicial: 2, entrada: 2, saida: 2 },
  { id: 4, nome: 'Lexis', quantidadeInicial: 3, entrada: 3, saida: 3 },
  { id: 5, nome: 'Kenton', quantidadeInicial: 4, entrada: 4, saida: 4 },
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
    {
      field: 'nome',
      headerName: 'Produto',
      width: 200,
      sortable: true,
    },
    {
      field: 'quantidadeInicial',
      headerName: 'Qtd Inicial',
      width: 120,
      sortable: true,
    },
    {
      field: 'entrada',
      headerName: 'Entrada',
      width: 120,
      sortable: true,
    },
    {
      field: 'saida',
      headerName: 'Saída',
      width: 120,
      sortable: true,
    },
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
            style={{ marginLeft: 8 }}
            onClick={() => handleDelete(params.row.id)}
          >
            Remover
          </Button>
        </>
      ),
    },
  ];

  return (
    <div style={{ height: 500, width: '100%' }}>
      <h2>Estoque de Produtos</h2>
      <DataGrid
        rows={produtos}
        columns={columns}
        pageSize={5}
        rowsPerPageOptions={[5]}
        checkboxSelection
        disableSelectionOnClick
      />
    </div>
  );
}
