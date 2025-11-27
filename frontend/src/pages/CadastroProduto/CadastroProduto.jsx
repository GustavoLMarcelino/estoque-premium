import React, { useState } from 'react';
import { EstoqueAPI } from '../../services/estoque';
import { EstoqueSomAPI } from '../../services/estoqueSom';
import { ESTOQUE_TIPOS, upsertProdutoTipo } from '../../services/estoqueTipos';
import TitleComponent from '../../components/TitleComponent';
import FormGroupComponent from '../../components/FormGroupComponent';
import LabelComponent from '../../components/LabelComponent';
import InputComponent from '../../components/InputComponent';
import ButtonComponent from '../../components/ButtonComponent';

export default function CadastroProduto() {
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
      alert('Preencha Nome e Modelo.');
      return;
    }
    if (produtoNormalizado.custo <= 0 || produtoNormalizado.valorVenda <= 0) {
      alert('Custo e Valor de Venda devem ser maiores que zero.');
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
      alert('Produto cadastrado com sucesso!');
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
      alert(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex w-full bg-[#f3f3f3] p-[40px_60px] max-sm:p-[10px_15px] box-border justify-center items-start">
      <div className="flex flex-col w-full max-w-[800px] bg-white p-[30px_40px] max-sm:p-[25px_20px] rounded-[8px] shadow-[0_0_10px_rgba(0,0,0,0.08)] font-bold">
        <TitleComponent text={"Cadastro de Produto"}/>
        <form className="flex flex-col gap-[20px] w-full" onSubmit={handleSubmit}>
          <div className="flex flex-col gap-[10px]">
            <span className="font-bold text-[#222222]">Direcionar para *</span>
            <div className="flex gap-[20px] flex-wrap font-medium max-[450px]:flex-wrap max-[450px]:gap-[10px]">
              <div className='flex items-center gap-1'>
                <InputComponent idName="bateria" type="checkbox" checked={tipoEstoque === ESTOQUE_TIPOS.BATERIAS} onChange={() => setTipoEstoque(ESTOQUE_TIPOS.BATERIAS)} />
                <LabelComponent htmlFor="bateria" text={"Estoque de Baterias"}/>
              </div>
              <div className='flex items-center gap-1'>
                <InputComponent idName="som" type="checkbox" checked={tipoEstoque === ESTOQUE_TIPOS.SOM} onChange={() => setTipoEstoque(ESTOQUE_TIPOS.SOM)} />
                <LabelComponent htmlFor="som" text={"Estoque do Som"}/>
              </div>
            </div>
          </div>

          <FormGroupComponent>
            <LabelComponent htmlFor={"nome"} text={"Nome do Produto *"}/>
            <InputComponent idName={"nome"} type={"text"} value={produto.nome} onChange={handleChange} placeholder={"Digite o nome do produto"}/>
          </FormGroupComponent>

          <FormGroupComponent>
            <LabelComponent htmlFor={"modelo"} text={"Modelo *"}/>
            <InputComponent idName={"modelo"} type={"text"} value={produto.modelo} onChange={handleChange} placeholder={"Digite o modelo (Amperagem ou Tipo)"}/>
          </FormGroupComponent>

          <FormGroupComponent>
            <LabelComponent htmlFor={"custo"} text={"Custo *"}/>
            <InputComponent idName={"custo"} type={"number"} step={0.01} min={0} value={produto.custo} onChange={handleChange} placeholder={"Digite o custo"}/>
          </FormGroupComponent>

          <FormGroupComponent>
            <LabelComponent htmlFor={"valorVenda"} text={"Valor Venda *"}/>
            <InputComponent idName={"valorVenda"} type={"number"} step={0.01} min={0} value={produto.valorVenda} onChange={handleChange} placeholder={"Digite o valor de venda"}/>
          </FormGroupComponent>

          <FormGroupComponent>
            <LabelComponent htmlFor={"quantidadeMinima"} text={"Quantidade mínima *"}/>
            <InputComponent idName={"quantidadeMinima"} type={"number"} value={produto.quantidadeMinima} min={0} onChange={handleChange} placeholder={"Digite a quantidade mínima"}/>
          </FormGroupComponent>

          <FormGroupComponent>
            <LabelComponent htmlFor={"garantia"} text={"Garantia (Meses) *"}/>
            <InputComponent idName={"garantia"} type={"number"} min={0} value={produto.garantia} onChange={handleChange} placeholder={"Digite o tempo de garantia em meses"}/>
          </FormGroupComponent>

          <FormGroupComponent>
            <LabelComponent htmlFor={"quantidadeInicial"} text={"Quantidade Inicial *"}/>
            <InputComponent idName={"quantidadeInicial"} type={"number"} min={0} value={produto.quantidadeInicial} onChange={handleChange} placeholder={"Digite a quantidade inicial em estoque"}/>
          </FormGroupComponent>

          <ButtonComponent type={"submit"} disabled={saving} text={saving ? 'Salvando...' : 'Cadastrar'}/>
        </form>

      </div>
    </div>
  );
}
