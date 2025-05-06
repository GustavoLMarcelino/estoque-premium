// src/pages/Estoque/EstoquePro.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  Table,
  Button,
  Form,
  InputGroup,
  Modal,
  ToggleButton,
  ButtonGroup,
  Spinner
} from 'react-bootstrap';
import {
  useReactTable,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  flexRender
} from '@tanstack/react-table';
import { db, auth } from '../../firebase';
import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  getDoc,
  updateDoc
} from 'firebase/firestore';
import { useAuthState } from 'react-firebase-hooks/auth';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import 'bootstrap/dist/css/bootstrap.min.css';

export default function EstoquePro() {
  // 1) Hooks de autenticação e role
  const [user,    loadingUser]  = useAuthState(auth);
  const [role,    setRole]      = useState(null);

  // 2) Hooks de estado
  const [produtos,      setProdutos]      = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [globalFilter,  setGlobalFilter]  = useState(
    () => localStorage.getItem('estoqueFilter') || ''
  );
  const [showCriticos,  setShowCriticos]  = useState(false);
  const [editModal,     setEditModal]     = useState(false);
  const [produtoEditado,setProdutoEditado]= useState(null);

  // 3) Funções de fetch
  const fetchProdutos = async () => {
    const snap = await getDocs(collection(db, 'produtos'));
    setProdutos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };
  const fetchMovimentacoes = async () => {
    const snap = await getDocs(collection(db, 'movimentacoes'));
    setMovimentacoes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  // 4) useEffects
  useEffect(() => {
    if (user) {
      getDoc(doc(db, 'usuarios', user.uid)).then(snap => {
        setRole(snap.exists() ? snap.data().role : 'restricted');
      });
    }
  }, [user]);

  useEffect(() => {
    fetchProdutos();
    fetchMovimentacoes();
  }, []);

  useEffect(() => {
    localStorage.setItem('estoqueFilter', globalFilter);
  }, [globalFilter]);

  // 5) Cálculo de entradas/saídas
  const calcMov = (pid, tipo) =>
    movimentacoes
      .filter(m => m.produtoId === pid && m.tipo === tipo)
      .reduce((sum, m) => sum + m.quantidade, 0);

  // 6) Dados para a tabela (sempre calculados)
  const data = useMemo(
    () =>
      produtos.map(p => {
        const entradas  = calcMov(p.id, 'entrada');
        const saidas    = calcMov(p.id, 'saida');
        const emEstoque = p.quantidadeInicial + entradas - saidas;
        return { ...p, entradas, saidas, emEstoque };
      }),
    [produtos, movimentacoes]
  );

  // 7) Definição condicional de colunas (sempre invocada)
  const columns = useMemo(() => {
    const cols = [
      { accessorKey: 'nome',   header: 'Produto' },
      { accessorKey: 'modelo', header: 'Modelo' }
    ];

    if (role === 'admin') {
      cols.push(
        {
          accessorKey: 'custo',
          header: 'Custo',
          cell: i => `R$ ${parseFloat(i.getValue()).toFixed(2)}`
        },
        {
          accessorKey: 'valorVenda',
          header: 'Valor Venda',
          cell: i => `R$ ${parseFloat(i.getValue()).toFixed(2)}`
        },
        {
          id: 'percentLucro',
          header: '% Lucro',
          accessorFn: r => ((r.valorVenda - r.custo) / r.custo) * 100,
          cell: i => `${i.getValue().toFixed(2)}%`
        }
      );
    } else {
      cols.push({
        accessorKey: 'valorVenda',
        header: 'Valor Venda',
        cell: i => `R$ ${parseFloat(i.getValue()).toFixed(2)}`
      });
    }

    return cols.concat([
      { accessorKey: 'quantidadeMinima', header: 'Qtd Mínima' },
      {
        accessorKey: 'garantia',
        header: 'Garantia',
        cell: i => `${i.getValue()} meses`
      },
      { accessorKey: 'quantidadeInicial', header: 'Qtd Inicial' },
      { accessorKey: 'entradas',           header: 'Entradas' },
      { accessorKey: 'saidas',             header: 'Saídas' },
      {
        accessorKey: 'emEstoque',
        header: 'Em Estoque',
        cell: info => {
          const v   = info.getValue();
          const min = info.row.original.quantidadeMinima;
          const cls = v <= 0 ? 'text-danger' : v <= min ? 'text-warning' : 'text-success';
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
              onClick={() => { setProdutoEditado(info.row.original); setEditModal(true); }}
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
    ]);
  }, [role]);

  // 8) Hook da tabela (sempre invocado)
  const table = useReactTable({
    data: useMemo(
      () =>
        data.filter(p => {
          const f  = globalFilter.toLowerCase();
          const ok = p.nome.toLowerCase().includes(f) || p.modelo.toLowerCase().includes(f);
          return showCriticos ? ok && p.emEstoque <= p.quantidadeMinima : ok;
        }),
      [data, globalFilter, showCriticos]
    ),
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel:    getCoreRowModel(),
    getFilteredRowModel:getFilteredRowModel(),
    getPaginationRowModel:getPaginationRowModel(),
    getSortedRowModel:  getSortedRowModel()
  });

  // 9) Handlers de CRUD / Export
  async function handleDelete(id) {
    if (window.confirm('Deseja excluir este produto?')) {
      await deleteDoc(doc(db, 'produtos', id));
      setProdutos(prev => prev.filter(p => p.id !== id));
    }
  }

  function handleEditChange(e) {
    const { name, value } = e.target;
    setProdutoEditado(prev => ({ ...prev, [name]: value }));
  }

  async function handleSave() {
    const p = produtoEditado;
    await updateDoc(doc(db, 'produtos', p.id), {
      nome: p.nome,
      modelo: p.modelo,
      custo: parseFloat(p.custo),
      valorVenda: parseFloat(p.valorVenda),
      quantidadeMinima: parseInt(p.quantidadeMinima, 10),
      garantia: parseInt(p.garantia, 10),
      quantidadeInicial: parseInt(p.quantidadeInicial, 10)
    });
    setEditModal(false);
    fetchProdutos();
  }

  function exportExcel() {
    const ws = XLSX.utils.json_to_sheet(table.getRowModel().rows.map(r => r.original));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Estoque');
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([buf]), 'estoque.xlsx');
  }

  // 10) Se tudo carregou, renderiza normalmente
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
            onChange={() => setShowCriticos(f => !f)}
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
                    {flexRender(header.column.columnDef.header, header.getContext())}
                    {sorted === 'asc' ? ' 🔼' : sorted === 'desc' ? ' 🔽' : ''}
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
                <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
              ))}
            </tr>
          ))}
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

      <Modal show={editModal} onHide={() => setEditModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Editar Produto</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {produtoEditado &&
            [
              'nome',
              'modelo',
              'custo',
              'valorVenda',
              'quantidadeMinima',
              'garantia',
              'quantidadeInicial'
            ].map(field => (
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
                  onChange={handleEditChange}
                />
              </Form.Group>
            ))}
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
