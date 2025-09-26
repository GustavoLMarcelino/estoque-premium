import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { EstoqueAPI } from '../../services/estoque';
import { MovAPI } from '../../services/movimentacoes';

const td = { border: '1px solid #ccc', padding: 8, whiteSpace: 'nowrap' };
const btn = { padding: '8px 12px', border: '1px solid #ccc', background: '#f7f7f7', cursor: 'pointer' };

function toDate(d) {
  if (!d) return null;
  return new Date(d);
}

export default function RegistroMovimentacoes() {
  const [globalFilter, setGlobalFilter] = useState('');
  const [tipo, setTipo] = useState('todos'); // todos | entrada | saida
  const [rows, setRows] = useState([]);
  const [sortBy, setSortBy] = useState({ key: 'data', dir: 'desc' });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  // paginação local
  const [page, setPage] = useState(1);
  const pageSize = 12;

  const carregar = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      // 1) Produtos (para mapear nome/modelo)
      const produtos = await EstoqueAPI.listar({ q: '' });
      const pmap = {};
      (produtos ?? []).forEach((p) => {
        pmap[String(p.id)] = {
          nomeProduto: p?.produto ?? p?.nome ?? 'Produto sem nome',
          modelo: p?.modelo ?? 'Modelo não informado',
        };
      });

      // 2) Movimentações: buscar todas as páginas (até 100 por página)
      const todas = [];
      let page = 1;
      let pages = 1;
      do {
        // o service já retorna data.data ou array
        const resp = await MovAPI.listar({ page, pageSize: 100 });
        // quando usamos o service, para obter paginação precisamos de outro método,
        // então vamos cair para a API crua aqui:
        // -> Adaptando: vamos chamar via fetch caso precise dos metadados
        if (Array.isArray(resp)) {
          // quando MovAPI.listar retornar somente array, só agregamos e paramos
          todas.push(...resp);
          pages = 1; // para sair do loop
          break;
        } else {
          // caso o service tenha sido ajustado para retornar apenas data,
          // fazemos uma chamada direta:
          const r = await fetch(
            `${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/movimentacoes?page=${page}&pageSize=100`
          ).then((x) => x.json());
          todas.push(...(r?.data ?? []));
          pages = Number(r?.pages || 1);
        }
        page += 1;
      } while (page <= pages);

      // 3) Montar linhas
      const data = (todas ?? []).map((m) => {
        const info = pmap[String(m?.produto_id)] || {};
        const d = toDate(m?.data_movimentacao);
        const tipoLower = String(m?.tipo || '').toLowerCase(); // 'entrada' | 'saida' (ou maiúsculo no DB)
        const q = Number(m?.quantidade) || 0;
        const valorUnit = Number(m?.valor_final || 0);
        const valorTotal = tipoLower === 'saida' ? valorUnit * q : 0;

        return {
          id: m?.id,
          nomeProduto: info?.nomeProduto ?? 'Produto não encontrado',
          modelo: info?.modelo ?? 'Modelo não informado',
          tipo: tipoLower === 'entrada' || tipoLower === 'saida' ? tipoLower : (tipoLower.includes('entr') ? 'entrada' : 'saida'),
          quantidade: q,
          valor: valorTotal,
          data: d,
          dataFormatada: d ? d.toLocaleString('pt-BR') : '',
        };
      });

      setRows(data);
    } catch (e) {
      console.error('RegistroMovimentacoes carregar ERRO:', e);
      setErr(e?.message || 'Falha ao carregar movimentações');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

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
    setSortBy((prev) => {
      if (!prev || prev.key !== key) return { key, dir: 'asc' };
      return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
    });
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 16 }}>📄 Registro de Movimentações</h2>

      {err && (
        <div style={{ padding: 10, marginBottom: 10, background: '#ffebee', border: '1px solid #e53935', color: '#b71c1c' }}>
          {err}
        </div>
      )}
      {loading && <div style={{ marginBottom: 10 }}>Carregando…</div>}

      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <input
          placeholder="Buscar produto ou modelo..."
          value={globalFilter}
          onChange={(e) => { setPage(1); setGlobalFilter(e.target.value); }}
          style={{ padding: 8, minWidth: 260, flex: 1 }}
        />
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          {[
            ['todos', 'Todos'],
            ['entrada', 'Entradas'],
            ['saida', 'Saídas'],
          ].map(([val, label]) => (
            <label
              key={val}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                border: '1px solid #ccc', padding: '6px 10px', borderRadius: 6,
                cursor: 'pointer', background: tipo === val ? '#e0e0e0' : '#f8f8f8'
              }}
            >
              <input
                type="radio"
                name="tipo"
                value={val}
                checked={tipo === val}
                onChange={() => { setPage(1); setTipo(val); }}
              />
              {label}
            </label>
          ))}
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead style={{ background: '#111', color: '#fff' }}>
            <tr>
              {[
                ['nomeProduto', 'Produto'],
                ['modelo', 'Modelo'],
                ['tipo', 'Tipo'],
                ['quantidade', 'Quantidade'],
                ['valor', 'Valor Total'],
                ['data', 'Data'],
              ].map(([key, label]) => (
                <th
                  key={key}
                  onClick={() => toggleSort(key)}
                  style={{ padding: 10, border: '1px solid #ccc', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  {label}
                  {sortBy.key === key ? (sortBy.dir === 'asc' ? ' 🔼' : ' 🔽') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length > 0 ? (
              pageRows.map((r, idx) => (
                <tr key={r.id ?? idx}>
                  <td style={td}>{r.nomeProduto}</td>
                  <td style={td}>{r.modelo}</td>
                  <td style={{ ...td, color: r.tipo === 'entrada' ? '#2e7d32' : '#c62828', fontWeight: 700 }}>
                    {String(r.tipo || '').toUpperCase()}
                  </td>
                  <td style={td}>{r.quantidade}</td>
                  <td style={td}>R$ {Number(r.valor || 0).toFixed(2)}</td>
                  <td style={td}>{r.dataFormatada}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} style={{ ...td, textAlign: 'center', fontStyle: 'italic' }}>
                  Nenhuma movimentação encontrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* paginação local */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}>
        <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1} style={btn}>
          ‹ Anterior
        </button>
        <span> Página <strong>{currentPage}</strong> de {pageCount} </span>
        <button onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={currentPage >= pageCount} style={btn}>
          Próxima ›
        </button>
      </div>
    </div>
  );
}
