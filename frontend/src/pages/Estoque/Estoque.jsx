import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { EstoqueAPI } from '../../services/estoque';
import InputComponent from '../../components/InputComponent';
import LabelComponent from '../../components/LabelComponent';
import TableComponent from '../../components/TableComponent';
import { render } from '@testing-library/react';
import TitleComponent from '../../components/TitleComponent';
import ButtonComponent from '../../components/ButtonComponent';
import EstoqueModal from '../../components/EstoqueModal';
import { IoIosArrowBack, IoIosArrowForward } from 'react-icons/io';

// mapeia backend -> UI
function mapDbToUi(row) {
  const custo = Number(row?.custo ?? 0);
  const valorVenda = Number(row?.valor_venda ?? 0);
  return {
    id: row.id,
    nome: row?.produto ?? '',
    modelo: row?.modelo ?? '',
    custo,
    valorVenda,
    quantidadeMinima: Number(row?.qtd_minima ?? 0),
    garantia: Number(row?.garantia ?? 0),
    quantidadeInicial: Number(row?.qtd_inicial ?? 0),
    entradas: Number(row?.entradas ?? 0),
    saidas: Number(row?.saidas ?? 0),
    emEstoque: Number(row?.em_estoque ?? (Number(row?.qtd_inicial ?? 0) + Number(row?.entradas ?? 0) - Number(row?.saidas ?? 0))),
  };
}

// mapeia UI -> backend
function mapUiToDb(p) {
  const toMoney = (n) => (n === '' || n == null ? null : Number(n).toFixed(2));
  return {
    produto: p.nome,
    modelo: p.modelo,
    custo: toMoney(p.custo),
    valor_venda: toMoney(p.valorVenda),
    qtd_minima: Number(p.quantidadeMinima ?? 0),
    garantia: Number(p.garantia ?? 0),
    qtd_inicial: Number(p.quantidadeInicial ?? 0),
  };
}

export default function Estoque() {
  const [role] = useState(() => localStorage.getItem('role') || 'admin');

  const [linhas, setLinhas] = useState([]);
  const [filtro, setFiltro] = useState('');           // <<< começa vazio
  const [criticos, setCriticos] = useState(false);

  const [sortBy, setSortBy] = useState({ key: 'nome', dir: 'asc' });

  const [editOpen, setEditOpen] = useState(false);
  const [produtoEdit, setProdutoEdit] = useState(null);

  const carregar = useCallback(async (q = '') => {
    const data = await EstoqueAPI.listar({ q });
    setLinhas((data || []).map(mapDbToUi));
  }, []);

  // 1) primeira carga
  useEffect(() => { carregar(''); }, [carregar]);

  // 2) salva o filtro atual (para próxima visita), mas NÃO usa o salvo na 1ª renderização
  useEffect(() => {
    localStorage.setItem('estoqueFilter', filtro);
    const t = setTimeout(() => carregar(filtro), 300);
    return () => clearTimeout(t);
  }, [filtro, carregar]);

  // 3) quando voltar do cadastro (ou focar a aba), recarrega
  useEffect(() => {
    const onFocus = () => carregar(filtro);
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [carregar, filtro]);

  const filtered = useMemo(() => {
    const f = (filtro ?? '').toLowerCase();
    return (linhas ?? []).filter((p) => {
      const okBusca = p.nome.toLowerCase().includes(f) || p.modelo.toLowerCase().includes(f);
      const okCritico = criticos ? Number(p.emEstoque || 0) <= Number(p.quantidadeMinima || 0) : true;
      return okBusca && okCritico;
    });
  }, [linhas, filtro, criticos]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { key, dir } = sortBy || {};
    arr.sort((a, b) => {
      const va = a?.[key]; const vb = b?.[key];
      if (typeof va === 'number' && typeof vb === 'number') return dir === 'asc' ? va - vb : vb - va;
      const sa = String(va ?? '').toLowerCase(); const sb = String(vb ?? '').toLowerCase();
      if (sa < sb) return dir === 'asc' ? -1 : 1;
      if (sa > sb) return dir === 'asc' ?  1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortBy]);

  function toggleSort(key) {
    setSortBy((prev) => (!prev || prev.key !== key) ? { key, dir: 'asc' } : { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' });
  }

  async function handleDelete(id) {
    if (!id) return;
    if (window.confirm('Deseja excluir este produto?')) {
      await EstoqueAPI.remover(id);
      setLinhas((prev) => prev.filter((x) => String(x.id) !== String(id)));
    }
  }

  function openEdit(prod) {
    setProdutoEdit({
      id: prod?.id,
      nome: prod?.nome ?? '',
      modelo: prod?.modelo ?? '',
      custo: prod?.custo ?? 0,
      valorVenda: prod?.valorVenda ?? 0,
      quantidadeMinima: prod?.quantidadeMinima ?? 0,
      garantia: prod?.garantia ?? 0,
      quantidadeInicial: prod?.quantidadeInicial ?? 0,
    });
    setEditOpen(true);
  }

  async function saveEdit() {
    const p = produtoEdit || {};
    const normalized = {
      ...p,
      custo: Number(p?.custo) || 0,
      valorVenda: Number(p?.valorVenda) || 0,
      quantidadeMinima: parseInt(p?.quantidadeMinima, 10) || 0,
      garantia: parseInt(p?.garantia, 10) || 0,
      quantidadeInicial: parseInt(p?.quantidadeInicial, 10) || 0,
    };
    const payload = mapUiToDb(normalized);
    const updated = await EstoqueAPI.atualizar(p.id, payload);
    const ui = mapDbToUi(updated);
    setLinhas((prev) => prev.map((x) => (x.id === ui.id ? ui : x)));
    setEditOpen(false);
  }

  const temFiltroAtivo = (filtro?.trim()?.length || 0) > 0 || criticos;

  const [page, setPage] = useState(1);
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paged = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    return sorted.slice(start, end);
  }, [sorted, currentPage]);

  return (
    <div className='p-[16px]'>
      <TitleComponent text={"⚡ Estoque Premium"}/>

      <div className='flex gap-[8px] mb-[12px] items-center max-[450px]:flex-wrap'>
        <InputComponent placeholder={"Buscar..."} value={filtro} onChange={(e) => setFiltro(e.target.value)}/>
        <div className='flex items-center gap-[6px] text-[#111827] font-bold'>
          <InputComponent idName={"checkbox"} type={"checkbox"} checked={criticos} onChange={() => setCriticos(v => !v)}/>
          <LabelComponent text={"Só críticos"} htmlFor={"checkbox"}/>
        </div>
        {temFiltroAtivo && (
          <ButtonComponent onClick={() => { setFiltro(''); setCriticos(false); }} text={"Limpar"} variant={"ghost"}/>
        )}
      </div>

      <div className='overflow-x-auto border border-[#e5e7eb] rounded-[12px] bg-white shadow-[0px_1px_6px_rgba(0,0,0,0.08)]'>
        <TableComponent
          columns={[
            {key: "nome", label: "Produto", sortable: true}, 
            {key: "modelo", label: "Modelo", sortable: true},
            ...(role === "admin" ?
              [
                {key: "custo", label: "Custo", sortable: true, render: (r) => `R$ ${Number(r.custo || 0).toFixed(2)}`}, 
                {key: "valorVenda", label: "Valor Venda", sortable: true, render: (r) => `R$ ${Number(r.valorVenda || 0).toFixed(2)}`}, 
                {key: "percent", label: "% Lucro", sortable: true, render: (r) => {const percent = r.custo > 0 ? ((r.valorVenda - r.custo) / r.custo) * 100 : 0; return `${percent.toFixed(2)}%`}},
              ] :
              [
                {key: "valorVenda", label: "Valor Venda", sortable: true, render: (r) => `R$ ${Number(r.valorVenda || 0).toFixed(2)}`},
              ]
            ),
            {key: "quantidadeMinima", label: "Qtd Mínima", sortable: true}, 
            {key: "garantia", label: "Garantia", sortable: true, render: (r) => `${r.garantia} meses`}, 
            {key: "quantidadeInicial", label: "Qtd Inicial", sortable: true}, 
            {key: "entradas", label: "Entradas", sortable: true}, 
            {key: "saidas", label: "Saídas", sortable: true}, 
            {key: "emEstoque", label: "Em Estoque", sortable: true, render: (r) => {
              const estoqueStyle = r.emEstoque <= 0 ? 
              { color: '#c62828', fontWeight: 700 } :
              r.emEstoque <= r.quantidadeMinima ?
              { color: '#ed6c02', fontWeight: 700 } :
              { color: '#2e7d32', fontWeight: 700 }
              return(
                <span style={estoqueStyle}>{r.emEstoque}</span>
              )
            }},
            {key: "acoes", label: "Ações", render: (r) => (
              <>
                <ButtonComponent variant={"ghost"} text={"Editar"} onClick={() => openEdit(r)}/>
                <ButtonComponent variant={"danger"} text={"Remover"} onClick={() => handleDelete(r.id)}/>
              </>
            )}
          ]}
          data={paged}
          noData={temFiltroAtivo ? 'Nenhum produto encontrado com os filtros atuais.' : 'Nenhum produto encontrado.'}
        />
      </div>
      <div className='flex gap-[12px] items-center mt-[12px]'>
        <ButtonComponent onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1} variant={"ghost"} text={<span className='flex items-center mr-1.5 gap-1'><IoIosArrowBack/>Anterior</span>}/>
        <span className='!text-base max-xl:!text-xs'>
          Página <strong>{currentPage}</strong> de {pageCount}
        </span>
        <ButtonComponent onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={currentPage >= pageCount} variant={"ghost"} text={<span className='flex items-center ml-1.5 gap-1'>Próxima<IoIosArrowForward/></span>}/>
      </div>
      {editOpen && (
        <EstoqueModal
          editOpen={editOpen}
          setEditOpen={setEditOpen}
          produtoEdit={produtoEdit}
          setProdutoEdit={setProdutoEdit}
          saveEdit={saveEdit}
        />
      )}
    </div>
  );
}
