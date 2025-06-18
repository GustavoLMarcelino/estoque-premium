import React, { useState, useMemo } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender
} from '@tanstack/react-table';
import { Table, Form, InputGroup, Button } from 'react-bootstrap';
import './RegistroMovimentacoes.css';

export default function RegistroMovimentacoes() {
  const [globalFilter, setGlobalFilter] = useState('');

  // Exemplo de dados estáticos (substitua por props ou API externa se necessário)
  const movimentacoes = [
    {
      id: '1',
      nomeProduto: 'Bateria Moura 60Ah',
      modelo: 'M60GD',
      tipo: 'entrada',
      quantidade: 10,
      valor: 320.0,
      dataFormatada: '18/06/2025 14:00'
    },
    {
      id: '2',
      nomeProduto: 'Bateria Heliar 75Ah',
      modelo: 'H75DF',
      tipo: 'saida',
      quantidade: 2,
      valor: 450.0,
      dataFormatada: '18/06/2025 15:30'
    }
  ];

  const columns = useMemo(() => [
    { accessorKey: 'nomeProduto', header: 'Produto' },
    { accessorKey: 'modelo', header: 'Modelo' },
    { accessorKey: 'tipo', header: 'Tipo' },
    { accessorKey: 'quantidade', header: 'Quantidade' },
    {
      accessorKey: 'valor',
      header: 'Valor Aplicado',
      cell: info => `R$ ${parseFloat(info.getValue()).toFixed(2)}`
    },
    { accessorKey: 'dataFormatada', header: 'Data' }
  ], []);

  const table = useReactTable({
    data: movimentacoes.filter(m => {
      const f = globalFilter.toLowerCase();
      return m.nomeProduto.toLowerCase().includes(f) || m.modelo.toLowerCase().includes(f);
    }),
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  return (
    <div className="movimentacoes-page">
      <h2>📄 Registro de Movimentações</h2>

      <InputGroup className="mb-3 filtros">
        <Form.Control
          placeholder="Buscar produto ou modelo..."
          value={globalFilter}
          onChange={e => setGlobalFilter(e.target.value)}
        />
        <Button variant="secondary" onClick={() => setGlobalFilter('')}>
          Limpar
        </Button>
      </InputGroup>

      <Table striped bordered hover responsive className="movimentacoes-tabela">
        <thead className="table-dark">
          {table.getHeaderGroups().map(hg => (
            <tr key={hg.id}>
              {hg.headers.map(header => {
                const sorted = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    style={{ cursor: header.column.getCanSort() ? 'pointer' : 'default' }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {sorted === 'asc' ? ' 🔼' : sorted === 'desc' ? ' 🔽' : ''}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map(row => (
              <tr key={row.id}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={columns.length} className="text-center">
                Nenhuma movimentação encontrada.
              </td>
            </tr>
          )}
        </tbody>
      </Table>

      <div className="d-flex justify-content-between align-items-center mt-3">
        <Button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
          ‹ Anterior
        </Button>
        <span>
          Página <strong>{table.getState().pagination.pageIndex + 1}</strong> de {table.getPageCount()}
        </span>
        <Button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
          Próxima ›
        </Button>
      </div>
    </div>
  );
}
