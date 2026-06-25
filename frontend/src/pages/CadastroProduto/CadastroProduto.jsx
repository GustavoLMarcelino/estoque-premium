import React, { useState } from 'react';
import {
  PackagePlus, Battery, Music, Tag, Cpu, DollarSign, TrendingUp,
  Hash, Shield, Package, Save, Loader2,
} from 'lucide-react';
import { EstoqueAPI } from '../../services/estoque';
import { EstoqueSomAPI } from '../../services/estoqueSom';
import { ESTOQUE_TIPOS, upsertProdutoTipo } from '../../services/estoqueTipos';
import { useToast } from '../../components/ui/Toast';

export default function CadastroProduto() {
  const toast = useToast();
  const [tipoEstoque, setTipoEstoque] = useState(ESTOQUE_TIPOS.BATERIAS);
  const [produto, setProduto] = useState({
    nome: '',
    modelo: '',
    custo: '',
    valorVenda: '',
    quantidadeMinima: '',
    garantia: '',
    quantidadeInicial: ''
  });
  const [saving, setSaving] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setProduto((prev) => ({ ...prev, [name]: value }));
  };

  // Helpers numéricos
  const toNumber = (val) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  };
  const toMoney = (n) => Number(n).toFixed(2);     // para DECIMAL no backend
  const toInt = (n) => {
    const v = parseInt(n, 10);
    return Number.isFinite(v) && v >= 0 ? v : 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const produtoNormalizado = {
      nome: String(produto.nome || '').trim(),
      modelo: String(produto.modelo || '').trim(),
      custo: toNumber(produto.custo),
      valorVenda: toNumber(produto.valorVenda),
      quantidadeMinima: toInt(produto.quantidadeMinima),
      garantia: toInt(produto.garantia),
      quantidadeInicial: toInt(produto.quantidadeInicial),
      createdAt: new Date().toISOString()
    };

    // Validações simples do front
    if (!produtoNormalizado.nome || !produtoNormalizado.modelo) {
      toast.error('Preencha Nome e Modelo.');
      return;
    }
    if (produtoNormalizado.custo <= 0 || produtoNormalizado.valorVenda <= 0) {
      toast.error('Custo e Valor de Venda devem ser maiores que zero.');
      return;
    }

    // Mapeia para o backend (snake_case)
    const payload = {
      produto: produtoNormalizado.nome,
      modelo: produtoNormalizado.modelo,
      custo: toMoney(produtoNormalizado.custo),
      valor_venda: toMoney(produtoNormalizado.valorVenda),
      qtd_minima: produtoNormalizado.quantidadeMinima,
      garantia: produtoNormalizado.garantia,
      qtd_inicial: produtoNormalizado.quantidadeInicial
    };

    try {
      setSaving(true);
      const service = tipoEstoque === ESTOQUE_TIPOS.SOM ? EstoqueSomAPI : EstoqueAPI;
      const created = await service.criar(payload);
      if (created?.id) {
        upsertProdutoTipo(created.id, tipoEstoque);
      }
      toast.success('Produto cadastrado com sucesso!');
      setProduto({
        nome: '',
        modelo: '',
        custo: '',
        valorVenda: '',
        quantidadeMinima: '',
        garantia: '',
        quantidadeInicial: ''
      });
      setTipoEstoque(ESTOQUE_TIPOS.BATERIAS);
    } catch (err) {
      console.error('Erro ao cadastrar produto:', err);
      const msg = err?.response?.data?.message || err?.message || 'Falha ao cadastrar produto';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-3xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 md:p-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
            <PackagePlus size={24} strokeWidth={2.2} />
          </span>
          <div>
            <h1 className="text-xl md:text-2xl font-bold text-slate-800">Cadastro de Produto</h1>
            <p className="text-sm text-slate-500">Preencha os dados para cadastrar um novo produto</p>
          </div>
        </div>

        <form className="mt-6" onSubmit={handleSubmit}>
          {/* Seletor de estoque */}
          <div>
            <span className="mb-2 block text-sm font-semibold text-slate-700">Direcionar para *</span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TipoCard
                active={tipoEstoque === ESTOQUE_TIPOS.BATERIAS}
                icon={Battery}
                label="Estoque de Baterias"
                onClick={() => setTipoEstoque(ESTOQUE_TIPOS.BATERIAS)}
              />
              <TipoCard
                active={tipoEstoque === ESTOQUE_TIPOS.SOM}
                icon={Music}
                label="Estoque do Som"
                onClick={() => setTipoEstoque(ESTOQUE_TIPOS.SOM)}
              />
            </div>
          </div>

          {/* Campos */}
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field className="sm:col-span-2" id="nome" name="nome" label="Nome do Produto *" icon={Tag}
              value={produto.nome} onChange={handleChange} placeholder="Digite o nome do produto" required />

            <Field id="modelo" name="modelo" label="Modelo *" icon={Cpu}
              value={produto.modelo} onChange={handleChange} placeholder="Digite o modelo (Amperagem ou Tipo)" required />

            <Field id="custo" name="custo" label="Custo *" icon={DollarSign} type="number" step="0.01" min="0"
              value={produto.custo} onChange={handleChange} placeholder="Digite o custo" required />

            <Field id="valorVenda" name="valorVenda" label="Valor Venda *" icon={TrendingUp} type="number" step="0.01" min="0"
              value={produto.valorVenda} onChange={handleChange} placeholder="Digite o valor de venda" required />

            <Field id="quantidadeMinima" name="quantidadeMinima" label="Quantidade mínima *" icon={Hash} type="number" min="0"
              value={produto.quantidadeMinima} onChange={handleChange} placeholder="Digite a quantidade mínima" required />

            <Field id="garantia" name="garantia" label="Garantia (Meses) *" icon={Shield} type="number" min="0"
              value={produto.garantia} onChange={handleChange} placeholder="Digite o tempo de garantia em meses" required />

            <Field id="quantidadeInicial" name="quantidadeInicial" label="Quantidade Inicial *" icon={Package} type="number" min="0"
              value={produto.quantidadeInicial} onChange={handleChange} placeholder="Digite a quantidade inicial em estoque" required />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="mt-6 flex w-full items-center justify-center gap-2 rounded-lg bg-amber-400 px-5 py-3 font-semibold text-slate-900 shadow-sm transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} strokeWidth={2.2} />}
            {saving ? 'Salvando...' : 'Cadastrar'}
          </button>
        </form>
      </div>
    </div>
  );
}

/* ---------- subcomponentes de UI ---------- */

function TipoCard({ active, icon: Icon, label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex items-center gap-3 rounded-xl border-2 px-4 py-3 text-left font-medium transition-colors ${
        active
          ? 'border-amber-400 bg-amber-50 text-amber-700'
          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50'
      }`}
    >
      <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${active ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
        <Icon size={18} />
      </span>
      {label}
    </button>
  );
}

function Field({ id, name, label, icon: Icon, className = '', ...inputProps }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-slate-600">{label}</label>
      <div className="relative">
        <Icon size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          id={id}
          name={name}
          {...inputProps}
          className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-3 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
        />
      </div>
    </div>
  );
}
