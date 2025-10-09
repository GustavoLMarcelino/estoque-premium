import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { EstoqueAPI } from '../../services/estoque';

// ===== estilos visuais (cabeçalho claro estilo Garantias) =====
const tableWrap = {
  overflowX: 'auto',
  border: '1px solid #e5e7eb',
  borderRadius: 12,
  background: '#fff',
  boxShadow: '0 1px 6px rgba(0,0,0,0.08)',
};
const table = { width: '100%', borderCollapse: 'collapse' };
const thBase = {
  padding: 12,
  textAlign: 'left',
  borderBottom: '1px solid #e5e7eb',
  background: '#f3f4f6',
  color: '#111827',
  fontWeight: 700,
  fontSize: 13,
  whiteSpace: 'nowrap',
};
const thClickable = { ...thBase, cursor: 'pointer', userSelect: 'none' };
const td = { borderBottom: '1px solid #e5e7eb', padding: 10, whiteSpace: 'nowrap' };

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

  const columns = [
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
  ];

  const temFiltroAtivo = (filtro?.trim()?.length || 0) > 0 || criticos;

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 16, color: '#111827' }}>⚡ Estoque Premium</h2>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input
          placeholder="Buscar..."
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
          style={{
            padding: 10, flex: 1, minWidth: 240,
            border: '1px solid #e5e7eb', borderRadius: 8, outline: 'none',
            background: '#fff'
          }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#111827' }}>
          <input type="checkbox" checked={criticos} onChange={() => setCriticos(v => !v)} />
          Só críticos
        </label>
        {temFiltroAtivo && (
          <button
            onClick={() => { setFiltro(''); setCriticos(false); }}
            style={{ ...btn, borderRadius: 8 }}
            title="Limpar filtros"
          >
            Limpar
          </button>
        )}
      </div>

      {/* Tabela sem paginação (todas as linhas) */}
      <div style={tableWrap}>
        <table style={table}>
          <thead>
            <tr>
              {columns.map(([key, label]) => {
                const isSortable = key !== 'acoes';
                const style = isSortable ? thClickable : thBase;
                return (
                  <th
                    key={key}
                    onClick={() => isSortable && toggleSort(key)}
                    style={style}
                    title={isSortable ? 'Clique para ordenar' : undefined}
                  >
                    {label}{sortBy.key === key ? (sortBy.dir === 'asc' ? ' 🔼' : ' 🔽') : ''}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.length > 0 ? (
              sorted.map((r, idx) => {
                const percent = r.custo > 0 ? ((r.valorVenda - r.custo) / r.custo) * 100 : 0;
                const estoqueStyle =
                  r.emEstoque <= 0 ? { color: '#c62828', fontWeight: 700 } :
                  r.emEstoque <= r.quantidadeMinima ? { color: '#ed6c02', fontWeight: 700 } :
                  { color: '#2e7d32', fontWeight: 700 };

                return (
                  <tr key={r.id ?? idx} style={{ background: '#fff' }}>
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
                    <td style={{ ...td, ...estoqueStyle }}>{r.emEstoque}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button onClick={() => openEdit(r)} style={btnSmOutline}>Editar</button>
                        <button onClick={() => handleDelete(r.id)} style={btnSmDanger}>Remover</button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={12} style={{ ...td, textAlign: 'center', fontStyle: 'italic', color: '#6b7280' }}>
                  {temFiltroAtivo ? 'Nenhum produto encontrado com os filtros atuais.' : 'Nenhum produto encontrado.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
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
