import React, { useState, useMemo, useEffect } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender
} from '@tanstack/react-table';
import {
  Table,
  Form,
  Button,
  Spinner,
  ButtonGroup,
  ToggleButton,
  InputGroup
} from 'react-bootstrap';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import { db } from '../../firebase.js';
import './RegistroMovimentacoes.css';

export default function RegistroMovimentacoes() {
  const [globalFilter, setGlobalFilter] = useState('');
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tipoSelecionado, setTipoSelecionado] = useState('todos'); // 'todos', 'entrada', 'saida'

  useEffect(() => {
    const fetchData = async () => {
      try {
        const produtosSnapshot = await getDocs(collection(db, 'produtos'));
        const produtosMap = {};
        produtosSnapshot.docs.forEach(doc => {
          const p = doc.data();
          produtosMap[doc.id] = {
            nomeProduto: p.nome ?? 'Produto sem nome',
            modelo: p.modelo ?? 'Modelo não informado'
          };
        });

        const q = query(collection(db, 'movimentacoes'), orderBy('data', 'desc'));
        const movimentacoesSnapshot = await getDocs(q);
        const data = movimentacoesSnapshot.docs.map(doc => {
          const item = doc.data();
          const produtoId = item.produtoId;
          const produtoInfo = produtosMap[produtoId];

          return {
            id: doc.id,
            nomeProduto: produtoInfo?.nomeProduto ?? 'Produto não encontrado',
            modelo: produtoInfo?.modelo ?? 'Modelo não informado',
            tipo: item.tipo ?? '-',
            quantidade: item.quantidade ?? 0,
            valor: item.valorTotal ?? 0,
            dataFormatada: new Date(
              item.data.toDate ? item.data.toDate() : item.data
            ).toLocaleString('pt-BR')
          };
        });

        setMovimentacoes(data);
        setLoading(false);
      } catch (error) {
        console.error('Erro ao buscar dados:', error);
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const dataFiltrada = useMemo(() => {
    const filtro = globalFilter.toLowerCase();
    return movimentacoes.filter(m => {
      const nome = m.nomeProduto?.toLowerCase() ?? '';
      const modelo = m.modelo?.toLowerCase() ?? '';
      const textoOK = nome.includes(filtro) || modelo.includes(filtro);
      const tipoOK =
        tipoSelecionado === 'todos' || m.tipo === tipoSelecionado;
      return textoOK && tipoOK;
    });
  }, [movimentacoes, globalFilter, tipoSelecionado]);

  const columns = useMemo(() => [
    { accessorKey: 'nomeProduto', header: 'Produto' },
    { accessorKey: 'modelo', header: 'Modelo' },
    {
      accessorKey: 'tipo',
      header: 'Tipo',
      cell: info => (
        <span className={info.getValue() === 'entrada' ? 'text-success' : 'text-danger'}>
          {info.getValue().toUpperCase()}
        </span>
      )
    },
    { accessorKey: 'quantidade', header: 'Quantidade' },
    {
      accessorKey: 'valor',
      header: 'Valor Final',
      cell: info => `R$ ${parseFloat(info.getValue()).toFixed(2)}`
    },
    { accessorKey: 'dataFormatada', header: 'Data' }
  ], []);

  const table = useReactTable({
    data: dataFiltrada,
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

      <InputGroup className="mb-3 w-100">
        <Form.Control
          placeholder="Buscar produto ou modelo..."
          value={globalFilter}
          onChange={e => setGlobalFilter(e.target.value)}
        />
        <ButtonGroup>
          <ToggleButton
            id="filtro-todos"
            type="radio"
            variant={tipoSelecionado === 'todos' ? 'secondary' : 'outline-secondary'}
            name="tipo"
            value="todos"
            checked={tipoSelecionado === 'todos'}
            onChange={() => setTipoSelecionado('todos')}
          >
            Todos
          </ToggleButton>
          <ToggleButton
            id="filtro-entradas"
            type="radio"
            variant={tipoSelecionado === 'entrada' ? 'success' : 'outline-success'}
            name="tipo"
            value="entrada"
            checked={tipoSelecionado === 'entrada'}
            onChange={() => setTipoSelecionado('entrada')}
          >
            Entradas
          </ToggleButton>
          <ToggleButton
            id="filtro-saidas"
            type="radio"
            variant={tipoSelecionado === 'saida' ? 'danger' : 'outline-danger'}
            name="tipo"
            value="saida"
            checked={tipoSelecionado === 'saida'}
            onChange={() => setTipoSelecionado('saida')}
          >
            Saídas
          </ToggleButton>
        </ButtonGroup>
      </InputGroup>

      {loading ? (
        <div className="text-center mt-5">
          <Spinner animation="border" />
          <p>Carregando movimentações...</p>
        </div>
      ) : (
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
      )}

      {!loading && (
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
      )}
    </div>
  );
}
