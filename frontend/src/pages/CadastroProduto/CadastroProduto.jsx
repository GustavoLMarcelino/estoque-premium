import React, { useState } from 'react';
import './CadastroProduto.css';
import { EstoqueAPI } from '../../services/estoque';
import { EstoqueSomAPI } from '../../services/estoqueSom';
import { ESTOQUE_TIPOS, upsertProdutoTipo } from '../../services/estoqueTipos';

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
    <div className="cadastro-page">
      <div className="cadastro-container">
        <h2>Cadastro de Produto</h2>
        <form className="cadastro-form" onSubmit={handleSubmit}>
          <div className="tipo-estoque-group">
            <span className="tipo-estoque-label">Direcionar para *</span>
            <div className="tipo-estoque-options">
              <label>
                <input
                  type="checkbox"
                  checked={tipoEstoque === ESTOQUE_TIPOS.BATERIAS}
                  onChange={() => setTipoEstoque(ESTOQUE_TIPOS.BATERIAS)}
                />
                Estoque de Baterias
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={tipoEstoque === ESTOQUE_TIPOS.SOM}
                  onChange={() => setTipoEstoque(ESTOQUE_TIPOS.SOM)}
                />
                Estoque do Som
              </label>
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="nome">Nome do Produto *</label>
            <input
              id="nome"
              type="text"
              name="nome"
              value={produto.nome}
              onChange={handleChange}
              placeholder="Digite o nome do produto"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="modelo">Modelo *</label>
            <input
              id="modelo"
              type="text"
              name="modelo"
              value={produto.modelo}
              onChange={handleChange}
              placeholder="Digite o modelo (Amperagem ou Tipo)"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="custo">Custo *</label>
            <input
              id="custo"
              type="number"
              step="0.01"
              name="custo"
              value={produto.custo}
              onChange={handleChange}
              placeholder="Digite o custo"
              required
              min="0"
            />
          </div>

          <div className="form-group">
            <label htmlFor="valorVenda">Valor Venda *</label>
            <input
              id="valorVenda"
              type="number"
              step="0.01"
              name="valorVenda"
              value={produto.valorVenda}
              onChange={handleChange}
              placeholder="Digite o valor de venda"
              required
              min="0"
            />
          </div>

          <div className="form-group">
            <label htmlFor="quantidadeMinima">Quantidade mínima *</label>
            <input
              id="quantidadeMinima"
              type="number"
              name="quantidadeMinima"
              value={produto.quantidadeMinima}
              onChange={handleChange}
              placeholder="Digite a quantidade mínima"
              required
              min="0"
            />
          </div>

          <div className="form-group">
            <label htmlFor="garantia">Garantia (Meses) *</label>
            <input
              id="garantia"
              type="number"
              name="garantia"
              value={produto.garantia}
              onChange={handleChange}
              placeholder="Digite o tempo de garantia em meses"
              required
              min="0"
            />
          </div>

          <div className="form-group">
            <label htmlFor="quantidadeInicial">Quantidade Inicial *</label>
            <input
              id="quantidadeInicial"
              type="number"
              name="quantidadeInicial"
              value={produto.quantidadeInicial}
              onChange={handleChange}
              placeholder="Digite a quantidade inicial em estoque"
              required
              min="0"
            />
          </div>

          <button type="submit" className="submit-button" disabled={saving}>
            {saving ? 'Salvando...' : 'Cadastrar'}
          </button>
        </form>

      </div>
    </div>
  );
}
