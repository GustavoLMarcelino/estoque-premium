import React, { useEffect, useMemo, useState, useCallback } from 'react';

const STORAGE = {
  produtos: 'produtos',
  movimentacoes: 'movimentacoes',
  role: 'role',
};

function loadList(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}
function saveList(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}
function deleteById(key, id) {
  const list = loadList(key);
  const next = list.filter((item) => String(item.id) !== String(id));
  saveList(key, next);
  return next;
}
function updateById(key, item) {
  const list = loadList(key);
  const idx = list.findIndex((x) => String(x.id) === String(item.id));
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...item };
    saveList(key, list);
  }
  return list;
}

export default function Estoque() {
  const [role] = useState(() => localStorage.getItem(STORAGE.role) || 'admin');
  const [produtos, setProdutos] = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);

  const [filtro, setFiltro] = useState(() => localStorage.getItem('estoqueFilter') || '');
  const [criticos, setCriticos] = useState(false);

  // UI state
  const [sortBy, setSortBy] = useState({ key: 'nome', dir: 'asc' }); // simple sort
  const [page, setPage] = useState(1);
  const pageSize = 10;

  const [editOpen, setEditOpen] = useState(false);
  const [produtoEdit, setProdutoEdit] = useState(null);

  useEffect(() => {
    setProdutos(loadList(STORAGE.produtos));
    setMovimentacoes(loadList(STORAGE.movimentacoes));
  }, []);

  useEffect(() => {
    localStorage.setItem('estoqueFilter', filtro);
  }, [filtro]);

  const calcMov = useCallback(
    (pid, tipo) =>
      (movimentacoes ?? [])
        .filter((m) => String(m?.produtoId) === String(pid) && m?.tipo === tipo)
        .reduce((sum, m) => sum + (parseInt(m?.quantidade, 10) || 0), 0),
    [movimentacoes]
  );

  const data = useMemo(() => {
    return (produtos ?? []).map((p) => {
      const entradas = calcMov(p?.id, 'entrada');
      const saidas = calcMov(p?.id, 'saida');
      const qtdInicial = parseInt(p?.quantidadeInicial, 10) || 0;
      const emEstoque = qtdInicial + entradas - saidas;

      return {
        ...p,
        nome: p?.nome ?? '',
        modelo: p?.modelo ?? '',
        custo: Number(p?.custo) || 0,
        valorVenda: Number(p?.valorVenda) || 0,
        quantidadeMinima: parseInt(p?.quantidadeMinima, 10) || 0,
        garantia: parseInt(p?.garantia, 10) || 0,
        quantidadeInicial: qtdInicial,
        entradas,
        saidas,
        emEstoque,
      };
    });
  }, [produtos, calcMov]);

  const filtered = useMemo(() => {
    const f = (filtro ?? '').toLowerCase();
    return (data ?? []).filter((p) => {
      const nome = (p?.nome ?? '').toLowerCase();
      const modelo = (p?.modelo ?? '').toLowerCase();
      const ok = nome.includes(f) || modelo.includes(f);
      return criticos ? ok && Number(p?.emEstoque || 0) <= Number(p?.quantidadeMinima || 0) : ok;
    });
  }, [data, filtro, criticos]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { key, dir } = sortBy || {};
    arr.sort((a, b) => {
      const va = a?.[key];
      const vb = b?.[key];
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
    setSortBy((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
    });
  }

  function handleDelete(id) {
    if (!id) return;
    if (window.confirm('Deseja excluir este produto?')) {
      const next = deleteById(STORAGE.produtos, id);
      setProdutos(next);
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

  function saveEdit() {
    const p = produtoEdit || {};
    const normalized = {
      ...p,
      custo: Number(p?.custo) || 0,
      valorVenda: Number(p?.valorVenda) || 0,
      quantidadeMinima: parseInt(p?.quantidadeMinima, 10) || 0,
      garantia: parseInt(p?.garantia, 10) || 0,
      quantidadeInicial: parseInt(p?.quantidadeInicial, 10) || 0,
    };
    const next = updateById(STORAGE.produtos, normalized);
    setProdutos(next);
    setEditOpen(false);
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 16 }}>⚡ Estoque Premium</h2>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          placeholder="Buscar..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          style={{ padding: 8, flex: 1, minWidth: 240 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input
            type="checkbox"
            checked={criticos}
            onChange={() => setCriticos((v) => !v)}
          />
          Só críticos
        </label>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#111', color: '#fff' }}>
            <tr>
              {[
                ['nome', 'Produto'],
                ['modelo', 'Modelo'],
                ...(role === 'admin'
                  ? [
                      ['custo', 'Custo'],
                      ['valorVenda', 'Valor Venda'],
                      ['percent', '% Lucro'],
                    ]
                  : [['valorVenda', 'Valor Venda']]),
                ['quantidadeMinima', 'Qtd Mínima'],
                ['garantia', 'Garantia'],
                ['quantidadeInicial', 'Qtd Inicial'],
                ['entradas', 'Entradas'],
                ['saidas', 'Saídas'],
                ['emEstoque', 'Em Estoque'],
                ['acoes', 'Ações'],
              ].map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => key !== 'acoes' && toggleSort(key)}
                  style={{
                    padding: 10,
                    border: '1px solid #ccc',
                    cursor: key !== 'acoes' ? 'pointer' : 'default',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                  {sortBy.key === key ? (sortBy.dir === 'asc' ? ' 🔼' : ' 🔽') : ''}
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

      {/* paginação simples */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1} style={btn}>
          ‹ Anterior
        </button>
        <span>
          Página <strong>{currentPage}</strong> de {pageCount}
        </span>
        <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={currentPage >= pageCount} style={btn}>
          Próxima ›
        </button>
      </div>

      {/* modal simples */}
      {editOpen && (
        <div style={backdrop} onClick={() => setEditOpen(false)}>
          <div style={modal} onClick={(e) => e.stopPropagation()}>
            <h3>Editar Produto</h3>
            {['nome','modelo','custo','valorVenda','quantidadeMinima','garantia','quantidadeInicial'].map((field) => (
              <div key={field} style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', marginBottom: 4 }}>
                  {field.replace(/([A-Z])/g, ' $1')}
                </label>
                <input
                  type={['custo','valorVenda','quantidadeMinima','garantia','quantidadeInicial'].includes(field) ? 'number' : 'text'}
                  value={produtoEdit?.[field] ?? ''}
                  onChange={(e) => setProdutoEdit((prev) => ({ ...prev, [field]: e.target.value }))}
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

const td = { border: '1px solid #ccc', padding: 8, whiteSpace: 'nowrap' };
const btn = { padding: '8px 12px', border: '1px solid #ccc', background: '#f7f7f7', cursor: 'pointer' };
const btnPrimary = { ...btn, background: '#1976d2', color: '#fff', borderColor: '#1976d2' };
const btnSmOutline = { ...btn, padding: '4px 8px' };
const btnSmDanger = { ...btn, padding: '4px 8px', background: '#c62828', color: '#fff', borderColor: '#c62828' };
const backdrop = { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex: 1000 };
const modal = { background:'#fff', width:'min(520px, 92vw)', borderRadius:8, padding:16, boxShadow:'0 10px 30px rgba(0,0,0,0.2)' };
