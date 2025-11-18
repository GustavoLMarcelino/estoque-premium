import React, { useState, useEffect, useMemo } from 'react';
import FormGroupComponent from '../../components/FormGroupComponent';
import LabelComponent from '../../components/LabelComponent';
import InputComponent from '../../components/InputComponent';
import { useNavigate } from 'react-router-dom';
import TitleComponent from '../../components/TitleComponent';
import SelectComponent from '../../components/SelectComponent';
import ButtonComponent from '../../components/ButtonComponent';

// -------- Helpers de armazenamento local (mock) ----------
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
function saveList(key, list) {
  localStorage.setItem(key, JSON.stringify(list));
}
function updateProdutoCusto(produtoId, novoCusto) {
  const produtos = loadList(STORAGE.produtos);
  const idx = produtos.findIndex((p) => String(p.id) === String(produtoId));
  if (idx >= 0) {
    produtos[idx] = { ...produtos[idx], custo: Number(novoCusto) || 0 };
    saveList(STORAGE.produtos, produtos);
  }
}
function addMovimentacao(m) {
  const list = loadList(STORAGE.movimentacoes);
  list.push({ id: Date.now(), ...m });
  saveList(STORAGE.movimentacoes, list);
  return list;
}

export default function LancamentoEntradaSaida() {
  const [produtos, setProdutos] = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);

  const [lancamento, setLancamento] = useState({
    tipo: '',
    produtoId: '',
    quantidade: ''
  });

  const [valorOriginal, setValorOriginal] = useState(0);
  const [ajusteValor, setAjusteValor] = useState('');
  const [tipoAjuste, setTipoAjuste] = useState('acrescimo');
  const [novoCusto, setNovoCusto] = useState('');

  const navigate = useNavigate();

  useEffect(() => {
    setProdutos(loadList(STORAGE.produtos));
    setMovimentacoes(loadList(STORAGE.movimentacoes));
  }, []);

  useEffect(() => {
    if (lancamento.produtoId) {
      const produtoSelecionado = produtos.find((p) => String(p.id) === String(lancamento.produtoId));
      setValorOriginal(produtoSelecionado ? Number(produtoSelecionado.valorVenda || 0) : 0);
    } else {
      setValorOriginal(0);
    }
  }, [lancamento.produtoId, produtos]);

  const custoAtual = useMemo(() => {
    const produto = produtos.find((p) => String(p.id) === String(lancamento.produtoId));
    return typeof produto?.custo === 'number' ? produto.custo : null;
  }, [lancamento.produtoId, produtos]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLancamento((prev) => ({ ...prev, [name]: value }));
  };

  const calculaEstoqueAtual = (produtoId) => {
    const produto = produtos.find((p) => String(p.id) === String(produtoId));
    if (!produto) return 0;

    const entradas = movimentacoes
      .filter((m) => String(m.produtoId) === String(produtoId) && m.tipo === 'entrada')
      .reduce((sum, m) => sum + (parseInt(m.quantidade, 10) || 0), 0);

    const saidas = movimentacoes
      .filter((m) => String(m.produtoId) === String(produtoId) && m.tipo === 'saida')
      .reduce((sum, m) => sum + (parseInt(m.quantidade, 10) || 0), 0);

    const qtdInicial = parseInt(produto.quantidadeInicial, 10) || 0;
    return qtdInicial + entradas - saidas;
  };

  const getValorFinal = () => {
    const v = Number(ajusteValor);
    if (!Number.isFinite(v)) return Number(valorOriginal) || 0;
    return tipoAjuste === 'acrescimo' ? (Number(valorOriginal) || 0) + v : (Number(valorOriginal) || 0) - v;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const { tipo, produtoId, quantidade } = lancamento;

    if (!tipo || !produtoId || !quantidade) {
      alert('Preencha todos os campos.');
      return;
    }

    const q = parseInt(quantidade, 10);
    if (!Number.isFinite(q) || q <= 0) {
      alert('Quantidade inválida.');
      return;
    }

    const estoqueAtual = calculaEstoqueAtual(produtoId);

    if (tipo === 'saida' && q > estoqueAtual) {
      alert(`Não há estoque suficiente! Estoque atual: ${estoqueAtual} unidades.`);
      return;
    }

    if (tipo === 'entrada') {
      if (!novoCusto || !(Number(novoCusto) >= 0)) {
        alert('Informe o novo valor de custo.');
        return;
      }
    }

    // Monta a movimentação
    const valorUnitario = tipo === 'saida' ? getValorFinal() : 0; // para entrada, não aplicamos venda aqui
    const valorTotal = tipo === 'saida' ? Number(valorUnitario) * q : 0;

    // Salva movimentação
    addMovimentacao({
      produtoId,
      tipo,
      quantidade: q,
      valorAplicado: tipo === 'saida' ? Number(valorUnitario) : undefined,
      valorTotal: tipo === 'saida' ? Number(valorTotal) : undefined,
      data: new Date().toISOString()
    });

    // Atualiza custo do produto em caso de entrada
    if (tipo === 'entrada') {
      updateProdutoCusto(produtoId, Number(novoCusto));
    }

    // Atualiza estado local após salvar
    setMovimentacoes(loadList(STORAGE.movimentacoes));

    alert('Lançamento registrado com sucesso!');

    // Reset form
    setLancamento({ tipo: '', produtoId: '', quantidade: '' });
    setAjusteValor('');
    setTipoAjuste('acrescimo');
    setNovoCusto('');

    navigate('/estoque');
  };

  return (
    <div className="w-full p-[40px_60px] max-sm:p-[10px_15px] bg-[#f3f3f3] min-h-screen box-border flex justify-center items-start">
      <div className="w-full max-w-[800px] bg-white p-[30px_40px] max-sm:p-[25px_20px] rounded-[8px] shadow-[0px_0px_10px_rgba(0,0,0,0.08)] flex flex-col">
        <TitleComponent text={"Lançamento de Entrada/Saída"}/>
        <form className="flex flex-col gap-[20px] w-full font-bold" onSubmit={handleSubmit}>
          <FormGroupComponent>
            <LabelComponent htmlFor={"tipo"} text={"Tipo *"}/>
            <SelectComponent idName={"tipo"} value={lancamento.tipo} onChange={handleChange} required>
              <option value="">Selecione</option>
              <option value="entrada">Entrada</option>
              <option value="saida">Saída</option>
            </SelectComponent>
          </FormGroupComponent>

          <FormGroupComponent>
            <LabelComponent htmlFor={"produtoId"} text={"Produto *"}/>
            <SelectComponent idName={"produtoId"} value={lancamento.produtoId} onChange={handleChange} required>
              <option value="">Selecione o produto</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome} (Estoque atual: {calculaEstoqueAtual(p.id)})
                </option>
              ))}
            </SelectComponent>
          </FormGroupComponent>

          <FormGroupComponent>
            <LabelComponent htmlFor={"quantidade"} text={"Quantidade *"}/>
            <InputComponent type={"number"} idName={"quantidade"} value={lancamento.quantidade} onChange={handleChange} placeholder={"Digite a quantidade"} min={1}/>
          </FormGroupComponent>

          {lancamento.tipo === 'entrada' && (
            <FormGroupComponent>
              <LabelComponent htmlFor={"novoCusto"} text={"Valor de Custo *"}/>
              <InputComponent idName={"novoCusto"} type={"number"} value={novoCusto} onChange={(e) => setNovoCusto(e.target.value)} min={0} step={0.01} placeholder={custoAtual !== null ? `Custo atual: R$ ${Number(custoAtual).toFixed(2)}` : 'Digite o novo valor de custo'}/>
            </FormGroupComponent>
          )}

          {lancamento.tipo === 'saida' && Number(valorOriginal) > 0 && (
            <>
              <FormGroupComponent>
                <LabelComponent htmlFor={"valorOriginal"} text={"Valor de Venda Atual"}/>
                <InputComponent idName={"valorOriginal"} type={"text"} value={`R$ ${Number(valorOriginal).toFixed(2)}`} disabled/>
              </FormGroupComponent>

              <FormGroupComponent>
                <LabelComponent text={"Ajuste no Valor de Venda"}/>
                <div className='flex gap-[10px]'>
                  <SelectComponent value={tipoAjuste} onChange={(e) => setTipoAjuste(e.target.value)}>
                    <option value="acrescimo">Acréscimo</option>
                    <option value="desconto">Desconto</option>
                  </SelectComponent>
                  <InputComponent type={"number"} placeholder={"Valor"} value={ajusteValor} onChange={(e) => setAjusteValor(e.target.value)}/>
                </div>
                <small className='mt-[5px] !text-[14px] max-sm:!text-xs font-normal block text-[#666666]'>
                  Valor final: R$ {getValorFinal().toFixed(2)}
                </small>
              </FormGroupComponent>
            </>
          )}

          <ButtonComponent type={"submit"} text={"Lançar"}/>
        </form>
      </div>
    </div>
  );
}
