// src/pages/Estoque/EstoquePro.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  Table,
  Button,
  Form,
  InputGroup,
  Modal,
  ToggleButton,
  ButtonGroup
} from 'react-bootstrap';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender
} from '@tanstack/react-table';
import { db } from '../../firebase';
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  updateDoc
} from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import 'bootstrap/dist/css/bootstrap.min.css';

export default function EstoquePro() {
  // Estados principais
  const [produtos, setProdutos] = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);

  // filtro global e críticos
  const [globalFilter, setGlobalFilter] = useState(() =>
    localStorage.getItem('estoqueFilter') || ''
  );
  const [showCriticos, setShowCriticos] = useState(false);

  // modal de edição
  const [editModal, setEditModal] = useState(false);
  const [produtoEditado, setProdutoEditado] = useState(null);

  // Carregar dados do Firestore
  useEffect(() => {
    fetchProdutos();
    fetchMovimentacoes();
  }, []);

  // Persistir filtro no localStorage
  useEffect(() => {
    localStorage.setItem('estoqueFilter', globalFilter);
  }, [globalFilter]);

  async function fetchProdutos() {
    const snap = await getDocs(collection(db, 'produtos'));
    setProdutos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  async function fetchMovimentacoes() {
    const snap = await getDocs(collection(db, 'movimentacoes'));
    setMovimentacoes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  }

  // Somar entradas/saídas
  const calcMov = (pid, tipo) =>
    movimentacoes
      .filter(m => m.produtoId === pid && m.tipo === tipo)
      .reduce((sum, m) => sum + m.quantidade, 0);

  // Montar dados para a tabela
  const data = useMemo(() => {
    return produtos.map(p => {
      const entradas = calcMov(p.id, 'entrada');
      const saidas = calcMov(p.id, 'saida');
      const emEstoque = p.quantidadeInicial + entradas - saidas;
      return { ...p, entradas, saidas, emEstoque };
    });
  }, [produtos, movimentacoes]);

  // Definir colunas, incluindo Quantidade Mínima e Garantia
  const columns = useMemo(
    () => [
      { accessorKey: 'nome', header: 'Produto' },
      { accessorKey: 'modelo', header: 'Modelo' },
      {
        accessorKey: 'custo',
        header: 'Custo',
        cell: info => `R$ ${parseFloat(info.getValue()).toFixed(2)}`
      },
      {
        accessorKey: 'valorVenda',
        header: 'Valor Venda',
        cell: info => `R$ ${parseFloat(info.getValue()).toFixed(2)}`
      },
      {
        accessorKey: 'quantidadeMinima',
        header: 'Qtd Mínima',
        cell: info => info.getValue()
      },
      {
        accessorKey: 'garantia',
        header: 'Garantia',
        cell: info => `${info.getValue()} meses`
      },
      {
        accessorKey: 'quantidadeInicial',
        header: 'Qtd Inicial',
        cell: info => info.getValue()
      },
      {
        accessorKey: 'entradas',
        header: 'Entradas',
        cell: info => info.getValue()
      },
      {
        accessorKey: 'saidas',
        header: 'Saídas',
        cell: info => info.getValue()
      },
      {
        accessorKey: 'emEstoque',
        header: 'Em Estoque',
        cell: info => {
          const v = info.getValue();
          const min = info.row.original.quantidadeMinima;
          const cls =
            v <= 0 ? 'text-danger' : v <= min ? 'text-warning' : 'text-success';
          return <span className={cls}>{v}</span>;
        }
      },
      {
        id: 'acoes',
        header: 'Ações',
        cell: info => (
          <>
            <Button
              size="sm"
              variant="outline-primary"
              onClick={() => {
                setProdutoEditado(info.row.original);
                setEditModal(true);
              }}
            >
              Editar
            </Button>{' '}
            <Button
              size="sm"
              variant="outline-danger"
              onClick={() => handleDelete(info.row.original.id)}
            >
              Remover
            </Button>
          </>
        )
      }
    ],
    []
  );

  // Configurar tabela com TanStack
  const table = useReactTable({
    data: useMemo(
      () =>
        data.filter(p => {
          const f = globalFilter.toLowerCase();
          const okText =
            p.nome.toLowerCase().includes(f) ||
            p.modelo.toLowerCase().includes(f);
          if (!showCriticos) return okText;
          return okText && p.emEstoque <= p.quantidadeMinima;
        }),
      [data, globalFilter, showCriticos]
    ),
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel()
  });

  // Ações de CRUD
  async function handleDelete(id) {
    if (window.confirm('Deseja excluir esse produto?')) {
      await deleteDoc(doc(db, 'produtos', id));
      setProdutos(prev => prev.filter(p => p.id !== id));
    }
  }

  async function handleSave() {
    const p = produtoEditado;
    const ref = doc(db, 'produtos', p.id);
    await updateDoc(ref, {
      nome: p.nome,
      modelo: p.modelo,
      custo: parseFloat(p.custo),
      valorVenda: parseFloat(p.valorVenda),
      quantidadeMinima: parseInt(p.quantidadeMinima),
      garantia: parseInt(p.garantia),
      quantidadeInicial: parseInt(p.quantidadeInicial)
    });
    setEditModal(false);
    fetchProdutos();
  }

  // Exportar para Excel/CSV
  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(
      table.getRowModel().rows.map(r => r.original)
    );
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buf], { type: 'application/octet-stream' }), 'estoque.xlsx');
  }

  return (
    <div className="container mt-5">
      <h2 className="mb-4">⚡ Estoque Premium</h2>

      <div className="d-flex mb-3">
        <InputGroup className="me-2">
          <Form.Control
            placeholder="Buscar..."
            value={globalFilter}
            onChange={e => setGlobalFilter(e.target.value)}
          />
        </InputGroup>

        <ButtonGroup className="me-2">
          <ToggleButton
            id="criticos"
            type="checkbox"
            variant={showCriticos ? 'danger' : 'outline-danger'}
            checked={showCriticos}
            onChange={() => setShowCriticos(prev => !prev)}
          >
            Só Críticos
          </ToggleButton>
        </ButtonGroup>

        <Button variant="success" onClick={exportExcel}>
          Exportar Excel
        </Button>
      </div>

      <Table striped bordered hover responsive>
        <thead className="table-dark">
          {table.getHeaderGroups().map(hg => (
            <tr key={hg.id}>
              {hg.headers.map(header => {
                const sorted = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    style={{
                      cursor: header.column.getCanSort() ? 'pointer' : 'default'
                    }}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}{' '}
                    {sorted === 'asc' ? '🔼' : sorted === 'desc' ? '🔽' : ''}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map(row => (
            <tr key={row.id}>
              {row.getVisibleCells().map(cell => (
                <td key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </Table>

      <div className="d-flex justify-content-between align-items-center mt-3">
        <Button
          variant="outline-secondary"
          onClick={() => table.previousPage()}
          disabled={!table.getCanPreviousPage()}
        >
          ‹ Anterior
        </Button>
        <span>
          Página{' '}
          <strong>
            {table.getState().pagination.pageIndex + 1} de{' '}
            {table.getPageCount()}
          </strong>
        </span>
        <Button
          variant="outline-secondary"
          onClick={() => table.nextPage()}
          disabled={!table.getCanNextPage()}
        >
          Próxima ›
        </Button>
      </div>

      <Modal show={editModal} onHide={() => setEditModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Editar Produto</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {produtoEditado &&
            ['nome', 'modelo', 'custo', 'valorVenda', 'quantidadeMinima', 'garantia', 'quantidadeInicial'].map(
              field => (
                <Form.Group className="mb-2" key={field}>
                  <Form.Label className="text-capitalize">
                    {field.replace(/([A-Z])/g, ' $1')}
                  </Form.Label>
                  <Form.Control
                    name={field}
                    type={
                      ['custo', 'valorVenda', 'quantidadeMinima', 'garantia', 'quantidadeInicial'].includes(
                        field
                      )
                        ? 'number'
                        : 'text'
                    }
                    value={produtoEditado[field]}
                    onChange={e =>
                      setProdutoEditado(prev => ({ ...prev, [field]: e.target.value }))
                    }
                  />
                </Form.Group>
              )
            )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setEditModal(false)}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={handleSave}>
            Salvar
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
