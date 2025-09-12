import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { EstoqueAPI } from '../../services/estoque';

// estilos base (iguais aos seus)
const td = { border: '1px solid #ccc', padding: 8, whiteSpace: 'nowrap' };
const btn = { padding: '8px 12px', border: '1px solid #ccc', background: '#f7f7f7', cursor: 'pointer' };
const btnPrimary = { ...btn, background: '#1976d2', color: '#fff', borderColor: '#1976d2' };
const btnSmOutline = { ...btn, padding: '4px 8px' };
const btnSmDanger = { ...btn, padding: '4px 8px', background: '#c62828', color: '#fff', borderColor: '#c62828' };
const backdrop = { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 1000 };
const modal = { background:'#fff', width:'min(520px, 92vw)', borderRadius:8, padding:16, boxShadow:'0 10px 30px rgba(0,0,0,0.2)' };

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

// mapeia UI -> backend (snake_case)
function mapUiToDb(p) {
  // para campos DECIMAL, enviar string é mais seguro
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

  const [linhas, setLinhas] = useState([]);      // itens já mapeados p/ UI
  const [filtro, setFiltro] = useState(() => localStorage.getItem('estoqueFilter') || '');
  const [criticos, setCriticos] = useState(false);

  const [sortBy, setSortBy] = useState({ key: 'nome', dir: 'asc' });
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [editOpen, setEditOpen] = useState(false);
  const [produtoEdit, setProdutoEdit] = useState(null);

  const carregar = useCallback(async (q = '') => {
    const data = await EstoqueAPI.listar({ q });
    setLinhas(data.map(mapDbToUi));
  }, []);

  // 1) primeira carga
  useEffect(() => { carregar(''); }, [carregar]);

  // 2) persiste filtro e busca com debounce simples
  useEffect(() => {
    localStorage.setItem('estoqueFilter', filtro);
    const t = setTimeout(() => carregar(filtro), 300);
    return () => clearTimeout(t);
  }, [filtro, carregar]);

  // filtro crítico local (emEstoque <= quantidadeMinima)
  const filtered = useMemo(() => {
    const f = (filtro ?? '').toLowerCase();
    return (linhas ?? []).filter((p) => {
      const okBusca = p.nome.toLowerCase().includes(f) || p.modelo.toLowerCase().includes(f);
      const okCritico = criticos ? Number(p.emEstoque || 0) <= Number(p.quantidadeMinima || 0) : true;
      return okBusca && okCritico;
    });
  }, [linhas, filtro, criticos]);

  // ordenação local
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

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pageRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, currentPage]);

  function toggleSort(key) {
    setSortBy((prev) => (!prev || prev.key !== key) ? { key, dir: 'asc' } : { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' });
  }

  async function handleDelete(id) {
    if (!id) return;
    if (window.confirm('Deseja excluir este produto?')) {
      await EstoqueAPI.remover(id);
      // tira da UI sem precisar recarregar tudo
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

    // PUT no backend
    const payload = mapUiToDb(normalized);
    const updated = await EstoqueAPI.atualizar(p.id, payload);

    // reflete na UI (mapear resposta, caso venha snake_case)
    const ui = mapDbToUi(updated);
    setLinhas((prev) => prev.map((x) => (x.id === ui.id ? ui : x)));
    setEditOpen(false);
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 16 }}>⚡ Estoque Premium</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          placeholder="Buscar..."
          value={filtro}
          onChange={(e) => { setPage(1); setFiltro(e.target.value); }}
          style={{ padding: 8, flex: 1, minWidth: 240 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={criticos} onChange={() => setCriticos(v => !v)} />
          Só críticos
        </label>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#111', color: '#fff' }}>
            <tr>
              {[
                ['nome','Produto'],
                ['modelo','Modelo'],
                ...(role === 'admin'
                  ? [['custo','Custo'],['valorVenda','Valor Venda'],['percent','% Lucro']]
                  : [['valorVenda','Valor Venda']]),
                ['quantidadeMinima','Qtd Mínima'],
                ['garantia','Garantia'],
                ['quantidadeInicial','Qtd Inicial'],
                ['entradas','Entradas'],
                ['saidas','Saídas'],
                ['emEstoque','Em Estoque'],
                ['acoes','Ações'],
              ].map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => key !== 'acoes' && toggleSort(key)}
                  style={{ padding: 10, border: '1px solid #ccc', cursor: key !== 'acoes' ? 'pointer' : 'default', whiteSpace: 'nowrap' }}
                >
                  {label}{sortBy.key === key ? (sortBy.dir === 'asc' ? ' 🔼' : ' 🔽') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.map((r, idx) => {
              const percent = r.custo > 0 ? ((r.valorVenda - r.custo) / r.custo) * 100 : 0;
              const estoqueClass =
                r.emEstoque <= 0 ? { color: '#c62828', fontWeight: 700 } :
                r.emEstoque <= r.quantidadeMinima ? { color: '#ed6c02', fontWeight: 700 } :
                { color: '#2e7d32', fontWeight: 700 };

              return (
                <tr key={r.id ?? idx}>
                  <td style={td}>{r.nome}</td>
                  <td style={td}>{r.modelo}</td>
                  {role === 'admin' ? (
                    <>
                      <td style={td}>R$ {Number(r.custo || 0).toFixed(2)}</td>
                      <td style={td}>R$ {Number(r.valorVenda || 0).toFixed(2)}</td>
                      <td style={td}>{percent.toFixed(2)}%</td>
                    </>
                  ) : (
                    <td style={td}>R$ {Number(r.valorVenda || 0).toFixed(2)}</td>
                  )}
                  <td style={td}>{r.quantidadeMinima}</td>
                  <td style={td}>{r.garantia} meses</td>
                  <td style={td}>{r.quantidadeInicial}</td>
                  <td style={td}>{r.entradas}</td>
                  <td style={td}>{r.saidas}</td>
                  <td style={{ ...td, ...estoqueClass }}>{r.emEstoque}</td>
                  <td style={td}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <button onClick={() => openEdit(r)} style={btnSmOutline}>Editar</button>
                      <button onClick={() => handleDelete(r.id)} style={btnSmDanger}>Remover</button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={12} style={{ ...td, textAlign: 'center', fontStyle: 'italic' }}>
                  Nenhum produto encontrado.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} style={btn}>
          ‹ Anterior
        </button>
        <span> Página <strong>{currentPage}</strong> de {pageCount} </span>
        <button onClick={() => setPage(p => Math.min(pageCount, p + 1))} disabled={currentPage >= pageCount} style={btn}>
          Próxima ›
        </button>
      </div>

      {editOpen && (
        <div style={backdrop} onClick={() => setEditOpen(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h3>Editar Produto</h3>
            {['nome','modelo','custo','valorVenda','quantidadeMinima','garantia','quantidadeInicial'].map((field) => (
              <div key={field} style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', marginBottom: 4 }}>{field.replace(/([A-Z])/g, ' $1')}</label>
                <input
                  type={['custo','valorVenda','quantidadeMinima','garantia','quantidadeInicial'].includes(field) ? 'number' : 'text'}
                  value={produtoEdit?.[field] ?? ''}
                  onChange={(e) => setProdutoEdit(prev => ({ ...prev, [field]: e.target.value }))}
                  style={{ width: '100%', padding: 8 }}
                />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={() => setEditOpen(false)} style={btn}>Cancelar</button>
              <button onClick={saveEdit} style={btnPrimary}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
