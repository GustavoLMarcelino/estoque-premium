import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Zap, Package, DollarSign, AlertTriangle, ShoppingCart, CalendarDays, Inbox, X, CheckCircle2 } from 'lucide-react';
import api from '../../services/api';

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const formatCurrency = (v) => currencyFormatter.format(Number.isFinite(v) ? v : 0);

const normalizeProduto = (row, source) => {
  const valorVenda = Number(row?.valor_venda ?? row?.valorVenda ?? 0);
  const entradas = Number(row?.entradas ?? 0);
  const saidas = Number(row?.saidas ?? 0);
  const qtdInicial = Number(row?.qtd_inicial ?? 0);
  const emEstoque = Number(row?.em_estoque ?? (qtdInicial + entradas - saidas));
  const qtdMinima = Number(row?.qtd_minima ?? 0);
  const nomeBase = row?.produto ?? row?.nome ?? '';
  const modelo = row?.modelo ?? '';
  const nome = modelo ? `${nomeBase} - ${modelo}` : nomeBase;
  return {
    id: row?.id,
    source,
    nome,
    produtoNome: nomeBase,
    modelo,
    valorVenda: Number.isFinite(valorVenda) ? valorVenda : 0,
    emEstoque: Number.isFinite(emEstoque) ? emEstoque : 0,
    qtdMinima: Number.isFinite(qtdMinima) ? qtdMinima : 0,
  };
};

// Rótulo da linha a partir do "source" usado na normalização.
const LINHA_LABEL = { b: 'Baterias', s: 'Som' };

const normalizeMov = (mov, source, nomeMap, precoMap) => {
  const tipo = String(mov?.tipo || '').toLowerCase();
  const quantidade = Number(mov?.quantidade ?? 0);
  const valorFinal = Number(mov?.valor_final ?? mov?.valorFinal ?? 0);
  const dataStr = mov?.data_movimentacao || mov?.data || mov?.created_at;
  const data = dataStr ? new Date(dataStr) : null;
  const key = `${source}-${mov?.produto_id}`;
  const nome = nomeMap.get(key) || 'Produto';
  const preco = precoMap.get(key) || 0;
  const valorSaida = tipo === 'saida' ? (valorFinal > 0 ? valorFinal : preco * quantidade) : 0;
  return {
    tipo: tipo === 'entrada' ? 'entrada' : 'saida',
    nome,
    quantidade,
    data,
    valorSaida,
    sortKey: data ? data.getTime() : 0,
  };
};

// Paleta por card (alinhada à marca: âmbar/slate + verde/vermelho/azul)
const CARD_STYLES = {
  amber: { box: 'bg-amber-50 text-amber-600', accent: 'border-l-amber-400' },
  emerald: { box: 'bg-emerald-50 text-emerald-600', accent: 'border-l-emerald-400' },
  rose: { box: 'bg-rose-50 text-rose-600', accent: 'border-l-rose-400' },
  sky: { box: 'bg-sky-50 text-sky-600', accent: 'border-l-sky-400' },
};

export default function Home() {
  const [cards, setCards] = useState({ produtos: 0, valorTotal: 0, criticos: 0, vendasSemana: 0 });
  const [criticosItens, setCriticosItens] = useState([]);
  const [criticosModalOpen, setCriticosModalOpen] = useState(false);
  const [ultimasMov, setUltimasMov] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    let cancel = false;
    async function loadDashboard() {
      setLoading(true);
      setErrorMsg('');
      try {
        const [estResp, somResp, movResp, movSomResp] = await Promise.all([
          api.get('/estoque', { params: { pageSize: 500 } }),
          api.get('/estoque-som', { params: { pageSize: 500 } }),
          api.get('/movimentacoes', { params: { pageSize: 20 } }),
          api.get('/movimentacoes-som', { params: { pageSize: 20 } }),
        ]);

        const bateriasPayload = estResp?.data || {};
        const somPayload = somResp?.data || {};

        const baterias = Array.isArray(bateriasPayload) ? bateriasPayload : bateriasPayload.data || [];
        const som = Array.isArray(somPayload) ? somPayload : somPayload.data || [];

        const bateriasTotal = bateriasPayload?.total ?? baterias.length;
        const somTotal = somPayload?.total ?? som.length;

        const bateriasNorm = baterias.map((r) => normalizeProduto(r, 'b'));
        const somNorm = som.map((r) => normalizeProduto(r, 's'));
        const inventario = [...bateriasNorm, ...somNorm];

        const nomeMap = new Map(inventario.map((p) => [`${p.source}-${p.id}`, p.nome]));
        const precoMap = new Map(inventario.map((p) => [`${p.source}-${p.id}`, p.valorVenda]));

        const totalProdutos = Number(bateriasTotal) + Number(somTotal);
        const valorTotal = inventario.reduce((acc, p) => acc + p.valorVenda * p.emEstoque, 0);
        const criticosLista = inventario.filter((p) => p.emEstoque <= p.qtdMinima);

        const movsB = Array.isArray(movResp?.data?.data) ? movResp.data.data : [];
        const movsS = Array.isArray(movSomResp?.data?.data) ? movSomResp.data.data : [];

        const movNorm = [
          ...movsB.map((m) => normalizeMov(m, 'b', nomeMap, precoMap)),
          ...movsS.map((m) => normalizeMov(m, 's', nomeMap, precoMap)),
        ]
          .filter((m) => m.data)
          .sort((a, b) => b.sortKey - a.sortKey);

        const ultimas = movNorm.slice(0, 8).map((m) => ({
          ...m,
          dataFmt: m.data ? m.data.toLocaleDateString('pt-BR') : '',
        }));

        const umaSemanaAtras = new Date();
        umaSemanaAtras.setDate(umaSemanaAtras.getDate() - 7);
        const vendasSemana = movNorm
          .filter((m) => m.tipo === 'saida' && m.data && m.data >= umaSemanaAtras)
          .reduce((acc, m) => acc + m.valorSaida, 0);

        if (cancel) return;
        setCards({
          produtos: totalProdutos,
          valorTotal,
          criticos: criticosLista.length,
          vendasSemana,
        });
        setCriticosItens(criticosLista);
        setUltimasMov(ultimas);
      } catch (e) {
        if (cancel) return;
        console.error('Dashboard Home erro:', e);
        setErrorMsg(e?.response?.data?.message || e?.message || 'Falha ao carregar dashboard');
      } finally {
        if (!cancel) setLoading(false);
      }
    }

    loadDashboard();
    return () => { cancel = true; };
  }, []);

  const cardsContent = useMemo(() => ([
    { label: 'Produtos em Estoque', value: `${cards.produtos} produtos`, icon: Package, color: 'amber' },
    { label: 'Valor Total', value: formatCurrency(cards.valorTotal), icon: DollarSign, color: 'emerald' },
    { label: 'Produtos Críticos', value: `${cards.criticos} itens`, icon: AlertTriangle, color: 'rose', onClick: () => setCriticosModalOpen(true) },
    { label: 'Vendas da Semana', value: formatCurrency(cards.vendasSemana), icon: ShoppingCart, color: 'sky' },
  ]), [cards]);

  return (
    <div className="min-h-screen bg-white p-4 md:p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
          <Zap size={24} strokeWidth={2.2} />
        </span>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-800">Bem-vindo ao Estoque Premium</h1>
          <p className="text-sm text-slate-500">Gerencie seu estoque em tempo real</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cardsContent.map(({ label, value, icon: Icon, color, onClick }) => {
          const s = CARD_STYLES[color];
          const clickable = typeof onClick === 'function';
          return (
            <div
              key={label}
              onClick={onClick}
              role={clickable ? 'button' : undefined}
              tabIndex={clickable ? 0 : undefined}
              onKeyDown={clickable ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } } : undefined}
              className={`rounded-2xl border border-l-4 ${s.accent} border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md ${
                clickable ? 'cursor-pointer hover:border-rose-300 hover:bg-rose-50/40 focus:outline-none focus:ring-2 focus:ring-rose-200' : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${s.box}`}>
                  <Icon size={20} />
                </span>
              </div>
              <p className="mt-3 text-2xl font-bold text-slate-800">{value}</p>
            </div>
          );
        })}
      </div>

      {/* Últimas Movimentações */}
      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CalendarDays size={18} className="text-slate-500" />
            <h2 className="text-base font-semibold text-slate-800">Últimas Movimentações</h2>
          </div>
          {loading && <span className="text-sm text-slate-400">Carregando...</span>}
        </div>

        {errorMsg && (
          <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMsg}
          </div>
        )}

        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Quantidade</th>
                  <th className="px-4 py-3">Data</th>
                </tr>
              </thead>
              <tbody>
                {ultimasMov.map((m, i) => (
                  <tr
                    key={`${m.nome}-${m.sortKey}-${i}`}
                    className="border-t border-slate-100 odd:bg-white even:bg-slate-50/60 transition-colors hover:bg-amber-50/50"
                  >
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          m.tipo === 'entrada'
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'bg-rose-50 text-rose-700'
                        }`}
                      >
                        {m.tipo ? m.tipo.charAt(0).toUpperCase() + m.tipo.slice(1) : ''}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{m.nome}</td>
                    <td className="px-4 py-3 text-slate-700">{m.quantidade}</td>
                    <td className="px-4 py-3 text-slate-700">{m.dataFmt}</td>
                  </tr>
                ))}

                {!loading && ultimasMov.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-12">
                      <div className="flex flex-col items-center justify-center gap-2 text-slate-400">
                        <Inbox size={32} strokeWidth={1.5} />
                        <span className="text-sm">Sem movimentações recentes</span>
                      </div>
                    </td>
                  </tr>
                )}

                {loading && ultimasMov.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-12 text-center text-sm text-slate-400">
                      Carregando dados...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {criticosModalOpen && (
        <CriticosModal itens={criticosItens} onClose={() => setCriticosModalOpen(false)} />
      )}
    </div>
  );
}

/* ===== Modal de Produtos Críticos ===== */
function CriticosModal({ itens, onClose }) {
  // Agrupa por linha mantendo a ordem: Baterias, depois Som.
  const grupos = useMemo(() => {
    return ['b', 's']
      .map((source) => ({
        source,
        label: LINHA_LABEL[source],
        itens: itens.filter((i) => i.source === source),
      }))
      .filter((g) => g.itens.length > 0);
  }, [itens]);

  const vazio = itens.length === 0;

  return createPortal(
    <div
      className="fixed inset-0 z-[9990] flex items-start justify-center bg-slate-900/60 p-4 backdrop-blur-sm sm:items-center"
      onMouseDown={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        onMouseDown={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-rose-50 text-rose-600">
              <AlertTriangle size={20} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Produtos Críticos</h2>
              <p className="text-sm text-slate-500">Produtos abaixo da quantidade mínima</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={20} />
          </button>
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto p-5">
          {vazio ? (
            <div className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-500">
                <CheckCircle2 size={36} strokeWidth={1.8} />
              </span>
              <p className="text-sm font-medium text-slate-600">Nenhum produto crítico no momento</p>
            </div>
          ) : (
            grupos.map((g) => (
              <div key={g.source} className="mb-5 last:mb-0">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{g.label}</span>
                  <span className="h-px flex-1 bg-slate-200" />
                  <span className="text-xs font-semibold text-rose-600">{g.itens.length}</span>
                </div>
                <ul className="space-y-2">
                  {g.itens.map((it) => (
                    <li
                      key={`${it.source}-${it.id}`}
                      className="flex items-center justify-between gap-3 rounded-lg border border-l-4 border-slate-200 border-l-rose-500 bg-white px-4 py-3 shadow-sm"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-800">{it.produtoNome || '—'}</p>
                        <p className="truncate text-xs text-slate-500">Modelo: {it.modelo || '—'}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-4 text-right">
                        <div>
                          <span className="block text-[11px] uppercase text-slate-400">Em estoque</span>
                          <span className="text-base font-bold text-rose-600">{it.emEstoque}</span>
                        </div>
                        <div>
                          <span className="block text-[11px] uppercase text-slate-400">Mínimo</span>
                          <span className="text-base font-semibold text-slate-600">{it.qtdMinima}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
