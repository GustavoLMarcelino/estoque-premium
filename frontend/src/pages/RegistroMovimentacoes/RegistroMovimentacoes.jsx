import React, { useEffect, useMemo, useState } from 'react';
import TitleComponent from '../../components/TitleComponent';
import InputComponent from '../../components/InputComponent';
import LabelComponent from '../../components/LabelComponent';
import TableComponent from '../../components/TableComponent';
import ButtonComponent from '../../components/ButtonComponent';
import { IoIosArrowBack, IoIosArrowForward } from "react-icons/io";

const STORAGE = {
  produtos: 'produtos',
  movimentacoes: 'movimentacoes',
};

function loadList(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}
function toDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  if (typeof d === 'object' && d.seconds) return new Date(d.seconds * 1000);
  return new Date(d);
}

export default function RegistroMovimentacoes() {
  const [globalFilter, setGlobalFilter] = useState('');
  const [tipo, setTipo] = useState('todos'); // todos | entrada | saida
  const [rows, setRows] = useState([]);
  const [sortBy, setSortBy] = useState({ key: 'data', dir: 'desc' });

  const [page, setPage] = useState(1);
  const pageSize = 12;

  useEffect(() => {
    const produtos = loadList(STORAGE.produtos);
    const movs = loadList(STORAGE.movimentacoes);

    const pmap = {};
    (produtos ?? []).forEach((p) => {
      pmap[String(p.id)] = {
        nomeProduto: p?.nome ?? 'Produto sem nome',
        modelo: p?.modelo ?? 'Modelo não informado',
      };
    });

    const data = (movs ?? []).map((m) => {
      const info = pmap[String(m?.produtoId)] || {};
      const d = toDate(m?.data);
      return {
        id: m?.id ?? `${m?.produtoId}-${m?.data}`,
        nomeProduto: info?.nomeProduto ?? 'Produto não encontrado',
        modelo: info?.modelo ?? 'Modelo não informado',
        tipo: m?.tipo ?? '-',
        quantidade: Number(m?.quantidade) || 0,
        valor: Number(m?.valorTotal) || 0,
        data: d,
        dataFormatada: d ? d.toLocaleString('pt-BR') : '',
      };
    });

    setRows(data);
  }, []);

  const filtered = useMemo(() => {
    const f = (globalFilter ?? '').toLowerCase();
    return (rows ?? []).filter((r) => {
      const textoOK =
        (r?.nomeProduto ?? '').toLowerCase().includes(f) ||
        (r?.modelo ?? '').toLowerCase().includes(f);
      const tipoOK = tipo === 'todos' || r?.tipo === tipo;
      return textoOK && tipoOK;
    });
  }, [rows, globalFilter, tipo]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { key, dir } = sortBy;
    arr.sort((a, b) => {
      const va = a?.[key];
      const vb = b?.[key];
      if (key === 'data') {
        const ta = a?.data?.getTime?.() || 0;
        const tb = b?.data?.getTime?.() || 0;
        return dir === 'asc' ? ta - tb : tb - ta;
      }
      if (typeof va === 'number' && typeof vb === 'number') {
        return dir === 'asc' ? va - vb : vb - va;
      }
      const sa = String(va ?? '').toLowerCase();
      const sb = String(vb ?? '').toLowerCase();
      if (sa < sb) return dir === 'asc' ? -1 : 1;
      if (sa > sb) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [filtered, sortBy]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage]);

  function toggleSort(key) {
    setSortBy((prev) => (!prev || prev.key !== key) ? { key, dir: 'asc' } : { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' });
  }

  return (
    <div className="p-[16px]">
      <TitleComponent text={"📄 Registro de Movimentações"}/>

      <div className='flex gap-[8px] mb-[12px] items-center max-[450px]:flex-wrap'>
        <InputComponent placeholder="Buscar produto ou modelo..." value={globalFilter} onChange={(e) => { setPage(1); setGlobalFilter(e.target.value); }}/>
        <div className='flex gap-[8px] items-center'>
          {[
            ['todos', 'Todos'],
            ['entrada', 'Entradas'],
            ['saida', 'Saídas'],
          ].map(([val, label]) => (
            <React.Fragment key={val}>
              <InputComponent type={"radio"} idName={val} value={val} checked={tipo === val} onChange={() => { setPage(1); setTipo(val); }}/>
              <LabelComponent text={label} htmlFor={val}/>
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className='overflow-x-auto border border-[#e5e7eb] rounded-[12px] bg-white shadow-[0px_1px_6px_rgba(0,0,0,0.08)]'>
        <TableComponent
          columns={[
            {key: "nomeProduto", label: "Produto", sortable: true},
            {key: "modelo", label: "Modelo", sortable: true},
            {key: "tipo", label: "Tipo", sortable: true, render: (r) => (<span className={`font-bold !text-base max-xl:!text-xs ${r.tipo === "entrada" ? "text-green-700" : "text-red-700"}`}>{String(r.tipo).toUpperCase()}</span>),},
            {key: "quantidade", label: "Quantidade", sortable: true},
            {key: "valor", label: "Valor Final", sortable: true, render: (r) => `R$ ${Number(r.valor || 0).toFixed(2)}`},
            {key: "dataFormatada", label: "Data", sortable: true},
          ]}
          data={pageRows}
          noData={"Nenhuma movimentação encontrada."}
        />
      </div>

      <div className='flex gap-[12px] items-center mt-[12px]'>
        <ButtonComponent onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1} variant={"ghost"} text={<span className='flex items-center mr-1.5 gap-1'><IoIosArrowBack/>Anterior</span>}/>
        <span className='!text-base max-xl:!text-xs'>
          Página <strong>{currentPage}</strong> de {pageCount}
        </span>
        <ButtonComponent onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={currentPage >= pageCount} variant={"ghost"} text={<span className='flex items-center ml-1.5 gap-1'>Próxima<IoIosArrowForward/></span>}/>
      </div>
    </div>
  );
}
