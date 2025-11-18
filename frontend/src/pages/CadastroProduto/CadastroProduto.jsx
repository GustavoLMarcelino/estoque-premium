import React, { useState } from 'react';
import InputComponent from '../../components/InputComponent';
import LabelComponent from '../../components/LabelComponent';
import FormGroupComponent from '../../components/FormGroupComponent';
import TitleComponent from '../../components/TitleComponent';
import ButtonComponent from '../../components/ButtonComponent';

// --- Mock de persistência local (substitui Firestore temporariamente) ---
function saveProductMock(produtoNormalizado) {
  try {
    const key = 'produtos';
    const lista = JSON.parse(localStorage.getItem(key) || '[]');
    lista.push({ id: Date.now(), ...produtoNormalizado });
    localStorage.setItem(key, JSON.stringify(lista));
    return true;
  } catch (e) {
    console.error('Erro ao salvar no localStorage:', e);
    return false;
  }
}

export default function CadastroProduto() {
  const [produto, setProduto] = useState({
    nome: '',
    modelo: '',
    custo: '',
    valorVenda: '',
    quantidadeMinima: '',
    garantia: '',
    quantidadeInicial: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setProduto((prev) => ({ ...prev, [name]: value }));
  };

  // Normaliza e valida campos numéricos
  const toNumber = (val) => {
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const produtoNormalizado = {
      nome: String(produto.nome || '').trim(),
      modelo: String(produto.modelo || '').trim(),
      custo: toNumber(produto.custo),
      valorVenda: toNumber(produto.valorVenda),
      quantidadeMinima: Math.max(0, parseInt(produto.quantidadeMinima, 10) || 0),
      garantia: Math.max(0, parseInt(produto.garantia, 10) || 0),
      quantidadeInicial: Math.max(0, parseInt(produto.quantidadeInicial, 10) || 0),
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

    const ok = saveProductMock(produtoNormalizado);
    if (ok) {
      alert('Produto cadastrado com sucesso (salvo localmente)!');
      setProduto({
        nome: '',
        modelo: '',
        custo: '',
        valorVenda: '',
        quantidadeMinima: '',
        garantia: '',
        quantidadeInicial: ''
      });
    } else {
      alert('Erro ao cadastrar produto (mock). Veja o console.');
    }
  };

  return (
    <div className="flex w-[calc(100vw - 300px)] bg-[#f3f3f3] min-h-[100vh] p-[40px_60px] max-sm:p-[10px_15px] box-border justify-center items-start">
      <div className="flex flex-col w-full max-w-[800px] bg-white p-[30px_40px] max-sm:p-[25px_20px] rounded-[8px] shadow-[0_0_10px_rgba(0,0,0,0.08)] font-bold">
        <TitleComponent text={"Cadastro de Produto"}/>
        <form className="flex flex-col gap-[20px] w-full" onSubmit={handleSubmit}>
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
            <InputComponent idName={"custo"} type={"number"} step={0.01} value={produto.custo} onChange={handleChange} placeholder={"Digite o custo"}/>
          </FormGroupComponent>

          <FormGroupComponent>
            <LabelComponent htmlFor={"valorVenda"} text={"Valor Venda *"}/>
            <InputComponent idName={"valorVenda"} type={"number"} step={0.01} value={produto.valorVenda} onChange={handleChange} placeholder={"Digite o valor de venda"}/>
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

          <ButtonComponent text={"Cadastrar"} type={"submit"}/>
        </form>
      </div>
    </div>
  );
}
