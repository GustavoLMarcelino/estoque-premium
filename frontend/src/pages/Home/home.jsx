import React, { useEffect, useState, useMemo } from 'react';
import TitleComponent from '../../components/TitleComponent';
import CardComponent from '../../components/CardComponent';
import TableComponent from '../../components/TableComponent';
import api from '../../services/api';
import ErrorMsg from '../../components/ErrorMsgComponent';

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
  const nome = row?.modelo ? `${nomeBase} - ${row.modelo}` : nomeBase;
  return {
    id: row?.id,
    source,
    nome,
    valorVenda: Number.isFinite(valorVenda) ? valorVenda : 0,
    emEstoque: Number.isFinite(emEstoque) ? emEstoque : 0,
    qtdMinima: Number.isFinite(qtdMinima) ? qtdMinima : 0,
  };
};

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

export default function Home() {
  const [cards, setCards] = useState({ produtos: 0, valorTotal: 0, criticos: 0, vendasSemana: 0 });
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
        const criticos = inventario.filter((p) => p.emEstoque <= p.qtdMinima).length;

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
          criticos,
          vendasSemana,
        });
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

  return (
    <div className="p-[16px]">
      <TitleComponent text={"Bem-vindo ao Estoque Premium ⚡"}/>

      <div className="grid grid-cols-4 gap-4 mb-8 max-[550px]:grid-cols-2">
        <CardComponent icon={"📦"} title={"Produtos em Estoque"} value={`${produtos.length} produtos`}/>
        <CardComponent icon={"💲"} title={"Valor Total"} value={`R$ ${Number(valorTotal).toLocaleString("pt-BR", { minimumFractionDigits: 2, })}`}/>
        <CardComponent icon={"⚠️"} title={"Produtos Críticos"} value={`${produtosCriticos.length} itens`}/>
        <CardComponent icon={"🛒"} title={"Vendas da Semana"} value={`R$ ${Number(vendasSemana).toLocaleString("pt-BR", { minimumFractionDigits: 2, })}`}/>
      </div>

      <div className="w-full rounded-[12px] p-0 bg-transparent shadow-none">
        <h3 className="!m-[0px_0px_16px_4px] !text-[18px] max-lg:!text-[14px] text-[#222]">📅 Últimas Movimentações</h3>
        {errorMsg && (<ErrorMsg errorMsg={errorMsg}/>)}
        {loading && <span className="mb-[10px] text-[#6b7280] !text-base max-xl:!text-xs">Carregando...</span>}
        <div className="overflow-auto border border-[#e5e7eb] rounded-[12px] bg-white shadow-[0_1px_6px_rgba(0,0,0,0.08)]">
          <TableComponent
            columns={[{key: "tipo", label: "Tipo"}, {key: "produto", label: "Produto"}, {key: "quantidade", label: "Quantidade"}, {key: "data", label: "Data"}]}
            data={ultimasMov.map((m) => ({
              tipo: (
              <span className={`inline-block p-[2px_8px] rounded-full text-[12px] font-bold ${
                m.tipo === "entrada" ? "bg-[#ecfdf5]" : "bg-[#fef2f2]"
              } ${
                m.tipo === "entrada" ? "text-[#065f46]" : "text-[#991b1b]"
              }`}>
                {m.tipo ? m.tipo.charAt(0).toUpperCase() + m.tipo.slice(1) : ""}
              </span>
              ),
              produto: m.nome,
              quantidade: m.quantidade,
              data: m.dataFmt,
            }))}
            noData={!loading && ultimasMov.length === 0 && "Sem movimentações recentes" || loading && ultimasMov.length === 0 && "Carregando dados..."}
          />
        </div>
      </div>
    </div>
  );
}
