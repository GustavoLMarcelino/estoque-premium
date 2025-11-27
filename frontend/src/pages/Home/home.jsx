import React, { useEffect, useState, useMemo } from 'react';
import TitleComponent from '../../components/TitleComponent';
import CardComponent from '../../components/CardComponent';
import TableComponent from '../../components/TableComponent';

// Chaves usadas no localStorage
const STORAGE = {
  produtos: 'produtos',
  movimentacoes: 'movimentacoes'
};

function loadList(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
}

// Pega preço de venda do produto (fallback 0)
function getValorVenda(produtos, produtoId) {
  const p = produtos.find((x) => String(x.id) === String(produtoId));
  return Number(p?.valorVenda || 0);
}

// Converte data salva (ISO string ou Date) para Date
function toDate(d) {
  if (!d) return null;
  if (d instanceof Date) return d;
  // se veio como {seconds} de outro mock, tente converter
  if (typeof d === 'object' && d.seconds) return new Date(d.seconds * 1000);
  return new Date(d); // ISO string
}

export default function Home() {
  const [produtos, setProdutos] = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [carregado, setCarregado] = useState(false);

  useEffect(() => {
    const produtosList = loadList(STORAGE.produtos);
    const movList = loadList(STORAGE.movimentacoes);
    setProdutos(produtosList);
    setMovimentacoes(movList);
    setCarregado(true);
  }, []);

  // (opcional) recarregar ao voltar o foco
  useEffect(() => {
    const handleFocus = () => {
      setProdutos(loadList(STORAGE.produtos));
      setMovimentacoes(loadList(STORAGE.movimentacoes));
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  // Valor total do estoque (valorVenda * estoqueAtual)
  const valorTotal = useMemo(() => {
    if (!carregado) return 0;

    return produtos.reduce((total, p) => {
      const valorVenda = Number(p?.valorVenda || 0);
      const quantidadeInicial = parseInt(p?.quantidadeInicial, 10) || 0;

      const entradas = movimentacoes
        .filter((m) => String(m.produtoId) === String(p.id) && m.tipo === 'entrada')
        .reduce((acc, m) => acc + (parseInt(m.quantidade, 10) || 0), 0);

      const saidas = movimentacoes
        .filter((m) => String(m.produtoId) === String(p.id) && m.tipo === 'saida')
        .reduce((acc, m) => acc + (parseInt(m.quantidade, 10) || 0), 0);

      const estoqueAtual = quantidadeInicial + entradas - saidas;
      return total + valorVenda * estoqueAtual;
    }, 0);
  }, [carregado, produtos, movimentacoes]);

  // Produtos críticos (estoqueAtual <= quantidadeMinima)
  const produtosCriticos = useMemo(() => {
    if (!carregado) return [];

    return produtos.filter((p) => {
      const quantidadeMinima = parseInt(p?.quantidadeMinima, 10) || 0;
      const quantidadeInicial = parseInt(p?.quantidadeInicial, 10) || 0;

      const entradas = movimentacoes
        .filter((m) => String(m.produtoId) === String(p.id) && m.tipo === 'entrada')
        .reduce((acc, m) => acc + (parseInt(m.quantidade, 10) || 0), 0);

      const saidas = movimentacoes
        .filter((m) => String(m.produtoId) === String(p.id) && m.tipo === 'saida')
        .reduce((acc, m) => acc + (parseInt(m.quantidade, 10) || 0), 0);

      const estoqueAtual = quantidadeInicial + entradas - saidas;
      return estoqueAtual <= quantidadeMinima;
    });
  }, [carregado, produtos, movimentacoes]);

  // Vendas da semana (somatório de valorTotal ou fallback: valorVenda*quantidade)
  const vendasSemana = useMemo(() => {
    if (!carregado) return 0;
    const umaSemanaAtras = new Date();
    umaSemanaAtras.setDate(umaSemanaAtras.getDate() - 7);

    return movimentacoes
      .filter((m) => m.tipo === 'saida' && toDate(m.data) && toDate(m.data) > umaSemanaAtras)
      .reduce((total, m) => {
        const valorTotalMov = Number(m?.valorTotal);
        if (Number.isFinite(valorTotalMov) && valorTotalMov > 0) {
          return total + valorTotalMov;
        }
        const preco = getValorVenda(produtos, m.produtoId);
        const qtd = parseInt(m?.quantidade, 10) || 0;
        return total + preco * qtd;
      }, 0);
  }, [carregado, movimentacoes, produtos]);

  // Últimas movimentações (ordena por data desc; mostra 8)
  const ultimasMov = useMemo(() => {
    if (!carregado) return [];
    return [...movimentacoes]
      .filter((m) => toDate(m.data))
      .sort((a, b) => toDate(b.data) - toDate(a.data))
      .slice(0, 8)
      .map((m) => {
        const produto = produtos.find((p) => String(p.id) === String(m.produtoId));
        return {
          tipo: m.tipo,
          nome: produto?.nome ?? 'Produto',
          quantidade: parseInt(m.quantidade, 10) || 0,
          data: toDate(m.data)?.toLocaleDateString('pt-BR') ?? ''
        };
      });
  }, [carregado, movimentacoes, produtos]);

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
              data: m.data,
            }))}
            noData={"Sem movimentações recentes"}
          />
        </div>
      </div>
    </div>
  );
}
