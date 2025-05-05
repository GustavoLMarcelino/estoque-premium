import React, { useState, useEffect } from 'react';
import './Estoque.css';
import { db } from '../../firebase';
import { collection, getDocs, deleteDoc, doc, updateDoc } from 'firebase/firestore';

export default function Estoque() {
  const [produtos, setProdutos] = useState([]);
  const [movimentacoes, setMovimentacoes] = useState([]);
  const [filtroNome, setFiltroNome] = useState('');
  const [filtroModelo, setFiltroModelo] = useState('');
  const [editando, setEditando] = useState(null); // produto em edição
  const [produtoEditado, setProdutoEditado] = useState({});

  useEffect(() => {
    const fetchProdutos = async () => {
      const produtosSnapshot = await getDocs(collection(db, "produtos"));
      const listaProdutos = produtosSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setProdutos(listaProdutos);
    };

    fetchProdutos();
  }, []);

  useEffect(() => {
    const fetchMovimentacoes = async () => {
      const movimentacoesSnapshot = await getDocs(collection(db, "movimentacoes"));
      const listaMovimentacoes = movimentacoesSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setMovimentacoes(listaMovimentacoes);
    };

    fetchMovimentacoes();
  }, []);

  const handleDelete = async (id) => {
    if (window.confirm("Tem certeza que deseja remover este produto?")) {
      await deleteDoc(doc(db, "produtos", id));
      setProdutos(produtos.filter(produto => produto.id !== id));
    }
  };

  const handleEdit = (produto) => {
    setEditando(produto.id);
    setProdutoEditado(produto);
  };

  const handleEditChange = (e) => {
    const { name, value } = e.target;
    setProdutoEditado(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const salvarEdicao = async () => {
    const produtoRef = doc(db, "produtos", editando);
    await updateDoc(produtoRef, {
      nome: produtoEditado.nome,
      modelo: produtoEditado.modelo,
      custo: parseFloat(produtoEditado.custo),
      valorVenda: parseFloat(produtoEditado.valorVenda),
      quantidadeMinima: parseInt(produtoEditado.quantidadeMinima),
      garantia: parseInt(produtoEditado.garantia),
      quantidadeInicial: parseInt(produtoEditado.quantidadeInicial)
    });

    alert("Produto atualizado com sucesso!");

    // Atualiza a lista de produtos
    const produtosSnapshot = await getDocs(collection(db, "produtos"));
    const listaProdutos = produtosSnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    setProdutos(listaProdutos);

    setEditando(null);
  };

  const produtosFiltrados = produtos.filter(produto =>
    produto.nome.toLowerCase().includes(filtroNome.toLowerCase()) &&
    produto.modelo.toLowerCase().includes(filtroModelo.toLowerCase())
  );

  const calcularMovimentacoes = (produtoId, tipo) => {
    return movimentacoes
      .filter(mov => mov.produtoId === produtoId && mov.tipo === tipo)
      .reduce((total, mov) => total + mov.quantidade, 0);
  };

  return (
    <div className="estoque-page">
      <h2>Estoque de Produtos</h2>

      <div className="filtros">
        <input
          type="text"
          placeholder="Filtrar por nome do produto..."
          value={filtroNome}
          onChange={(e) => setFiltroNome(e.target.value)}
        />
        <input
          type="text"
          placeholder="Filtrar por modelo..."
          value={filtroModelo}
          onChange={(e) => setFiltroModelo(e.target.value)}
        />
      </div>

      <table className="estoque-tabela">
        <thead>
          <tr>
            <th>ID</th>
            <th>Produto</th>
            <th>Modelo</th>
            <th>Custo</th>
            <th>Valor Venda</th>
            <th>Qtd Min</th>
            <th>Garantia</th>
            <th>Qtd Inicial</th>
            <th>Entrada</th>
            <th>Saída</th>
            <th>Em Estoque</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {produtosFiltrados.map(produto => {
            const entradas = calcularMovimentacoes(produto.id, 'entrada');
            const saidas = calcularMovimentacoes(produto.id, 'saida');
            const emEstoque = produto.quantidadeInicial + entradas - saidas;

            const editandoEsse = editando === produto.id;

            return (
              <tr key={produto.id}>
                <td>{produto.id}</td>

                <td>
                  {editandoEsse ? (
                    <input name="nome" value={produtoEditado.nome} onChange={handleEditChange} />
                  ) : (
                    produto.nome
                  )}
                </td>

                <td>
                  {editandoEsse ? (
                    <input name="modelo" value={produtoEditado.modelo} onChange={handleEditChange} />
                  ) : (
                    produto.modelo
                  )}
                </td>

                <td>
                  {editandoEsse ? (
                    <input name="custo" type="number" value={produtoEditado.custo} onChange={handleEditChange} />
                  ) : (
                    `R$ ${parseFloat(produto.custo).toFixed(2)}`
                  )}
                </td>

                <td>
                  {editandoEsse ? (
                    <input name="valorVenda" type="number" value={produtoEditado.valorVenda} onChange={handleEditChange} />
                  ) : (
                    `R$ ${parseFloat(produto.valorVenda).toFixed(2)}`
                  )}
                </td>

                <td>
                  {editandoEsse ? (
                    <input name="quantidadeMinima" type="number" value={produtoEditado.quantidadeMinima} onChange={handleEditChange} />
                  ) : (
                    produto.quantidadeMinima
                  )}
                </td>

                <td>
                  {editandoEsse ? (
                    <input name="garantia" type="number" value={produtoEditado.garantia} onChange={handleEditChange} />
                  ) : (
                    `${produto.garantia} meses`
                  )}
                </td>

                <td>
                  {editandoEsse ? (
                    <input name="quantidadeInicial" type="number" value={produtoEditado.quantidadeInicial} onChange={handleEditChange} />
                  ) : (
                    produto.quantidadeInicial
                  )}
                </td>

                <td>{entradas}</td>
                <td>{saidas}</td>

                <td style={{ color: emEstoque <= 0 ? 'red' : emEstoque <= produto.quantidadeMinima ? 'orange' : 'green' }}>
                  {emEstoque}
                </td>

                <td>
                  {editandoEsse ? (
                    <>
                      <button onClick={salvarEdicao}>Salvar</button>
                      <button onClick={() => setEditando(null)}>Cancelar</button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleEdit(produto)}>Editar</button>
                      <button onClick={() => handleDelete(produto.id)} className="btn-remove">Remover</button>
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
