import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { EstoqueAPI } from "../../services/estoque";
import { MovAPI } from "../../services/movimentacoes";
import { EstoqueSomAPI } from "../../services/estoqueSom";
import { MovSomAPI } from "../../services/movimentacoesSom";
import { ESTOQUE_TIPOS } from "../../services/estoqueTipos";
import TitleComponent from "../../components/TitleComponent";
import ErrorMsg from "../../components/ErrorMsgComponent";
import FormGroupComponent from "../../components/FormGroupComponent";
import LabelComponent from "../../components/LabelComponent";
import SelectComponent from "../../components/SelectComponent";
import InputComponent from "../../components/InputComponent";
import ButtonComponent from "../../components/ButtonComponent";

export default function LancamentoEntradaSaida() {
  const [produtos, setProdutos] = useState([]);
  const [tipoEstoque, setTipoEstoque] = useState(ESTOQUE_TIPOS.BATERIAS);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");

  const [lancamento, setLancamento] = useState({
    formaPagamento: "",
    parcelas: 1,
    tipo: "",
    produtoId: "",
    quantidade: "",
  });

  const [valorOriginal, setValorOriginal] = useState(0); // valor de venda atual (unitario)
  const [ajusteValor, setAjusteValor] = useState("");
  const [tipoAjuste, setTipoAjuste] = useState("acrescimo");
  const [novoCusto, setNovoCusto] = useState("");

  const navigate = useNavigate();

  const toMoney = (n) => {
    const v = Number(n);
    return Number.isFinite(v) ? v.toFixed(2) : "0.00";
  };
  const toInt = (n, def = 0) => {
    const v = parseInt(n, 10);
    return Number.isFinite(v) && v >= 0 ? v : def;
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr("");
      try {
        const service = tipoEstoque === ESTOQUE_TIPOS.SOM ? EstoqueSomAPI : EstoqueAPI;
        const data = await service.listar({ q: "" });
        if (!alive) return;
        setProdutos(data || []);
      } catch (e) {
        if (!alive) return;
        console.error("Carregar produtos erro:", e);
        setErr(e?.response?.data?.message || e?.message || "Falha ao carregar produtos");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [tipoEstoque]);

  useEffect(() => {
    if (!lancamento.produtoId) {
      setValorOriginal(0);
      return;
    }
    const p = produtos.find((x) => String(x.id) === String(lancamento.produtoId));
    const venda = Number(p?.valor_venda ?? 0);
    setValorOriginal(Number.isFinite(venda) ? venda : 0);
  }, [lancamento.produtoId, produtos]);

  const custoAtual = useMemo(() => {
    const p = produtos.find((x) => String(x.id) === String(lancamento.produtoId));
    const c = Number(p?.custo ?? 0);
    return Number.isFinite(c) ? c : null;
  }, [lancamento.produtoId, produtos]);

  const estoqueAtual = useMemo(() => {
    const p = produtos.find((x) => String(x.id) === String(lancamento.produtoId));
    if (!p) return 0;
    const em = Number(
      p?.em_estoque ??
      (Number(p?.qtd_inicial ?? 0) + Number(p?.entradas ?? 0) - Number(p?.saidas ?? 0))
    );
    return Number.isFinite(em) ? em : 0;
  }, [lancamento.produtoId, produtos]);

  const getValorFinalUnit = () => {
    const base = Number(valorOriginal) || 0;
    const v = Number(ajusteValor);
    if (!Number.isFinite(v)) return base;
    return tipoAjuste === "acrescimo" ? base + v : base - v;
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setLancamento((prev) => ({ ...prev, [name]: value }));
  };

  async function handleSubmit(e) {
    e.preventDefault();
    const { tipo, produtoId, quantidade } = lancamento;

    if (!tipo || !produtoId || !quantidade) {
      alert("Preencha todos os campos.");
      return;
    }

    const q = toInt(quantidade, 0);
    if (q <= 0) {
      alert("Quantidade invalida.");
      return;
    }

    if (tipo === "saida" && q > estoqueAtual) {
      alert(`Nao ha estoque suficiente! Estoque atual: ${estoqueAtual} unidades.`);
      return;
    }

    try {
      if (tipo === "entrada") {
        if (novoCusto === "" || Number(novoCusto) < 0) {
          alert("Informe o novo valor de custo.");
          return;
        }
      }

      const movService = tipoEstoque === ESTOQUE_TIPOS.SOM ? MovSomAPI : MovAPI;
      const estoqueService = tipoEstoque === ESTOQUE_TIPOS.SOM ? EstoqueSomAPI : EstoqueAPI;

      const payloadMov = {
        produto_id: Number(produtoId),
        tipo,
        quantidade: q,
      };
      if (tipo === "saida") {
        const unit = getValorFinalUnit();
        payloadMov.valor_final = toMoney(unit);
      }
      const created = await movService.criar(payloadMov);
      try {
        const metaKey = "movPagamentos";
        const store = JSON.parse(localStorage.getItem(metaKey) || "{}");
        if (created && created.id) {
          store[String(created.id)] = {
            forma: lancamento.formaPagamento || "",
            parcelas: Number(lancamento.parcelas || 1),
            unit: getValorFinalUnit(),
          };
          localStorage.setItem(metaKey, JSON.stringify(store));
        }
      } catch {}

      if (tipo === "entrada") {
        await estoqueService.atualizar(Number(produtoId), { custo: toMoney(novoCusto) });
      }

      alert("Lancamento registrado com sucesso!");
      setLancamento({ formaPagamento: "", parcelas: 1, tipo: "", produtoId: "", quantidade: "" });
      setAjusteValor("");
      setTipoAjuste("acrescimo");
      setNovoCusto("");

      navigate(tipoEstoque === ESTOQUE_TIPOS.SOM ? "/estoque-som" : "/estoque");
    } catch (e2) {
      console.error("Lancamento erro:", e2);
      alert(e2?.response?.data?.message || e2?.message || "Falha ao registrar lancamento");
    }
  }

  return (
    <div className="w-full p-[40px_60px] max-sm:p-[10px_15px] bg-[#f3f3f3] box-border flex justify-center items-start">
      <div className="w-full max-w-[800px] bg-white p-[30px_40px] max-sm:p-[25px_20px] rounded-[8px] shadow-[0px_0px_10px_rgba(0,0,0,0.08)] flex flex-col">
        <TitleComponent text={`Lancamento de Entrada/Saida (${tipoEstoque === ESTOQUE_TIPOS.SOM ? "Som" : "Baterias"})`}/>

        {err && <ErrorMsg errorMsg={err}/>}
        {loading && <p className="mb-[10px] text-[#6b7280] !text-base max-xl:!text-xs">Carregando produtos...</p>}

        <form className="flex flex-col gap-[20px] w-full font-bold" onSubmit={handleSubmit}>
          <FormGroupComponent>
            <LabelComponent htmlFor={"tipoEstoque"} text={"Estoque *"}/>
            <SelectComponent idName={"tipoEstoque"} value={tipoEstoque} onChange={(e) => setTipoEstoque(e.target.value)}>
              <option value={ESTOQUE_TIPOS.BATERIAS}>Baterias</option>
              <option value={ESTOQUE_TIPOS.SOM}>Som</option>
            </SelectComponent>
          </FormGroupComponent>

          <FormGroupComponent>
            <LabelComponent htmlFor={"tipo"} text={"Tipo *"}/>
            <SelectComponent idName="tipo" value={lancamento.tipo} onChange={handleChange} required>
              <option value="">Selecione</option>
              <option value="entrada">Entrada</option>
              <option value="saida">Saida</option>
            </SelectComponent>
          </FormGroupComponent>

          <FormGroupComponent>
            <LabelComponent htmlFor={"produtoId"} text={"Produto *"}/>
            <SelectComponent idName="produtoId" value={lancamento.produtoId} onChange={handleChange} required disabled={loading || produtos.length === 0}
            >
              <option value="">Selecione o produto</option>
              {produtos.map((p) => {
                const estoque = Number(
                  p?.em_estoque ??
                  (Number(p?.qtd_inicial ?? 0) + Number(p?.entradas ?? 0) - Number(p?.saidas ?? 0))
                );
                return (
                  <option key={p.id} value={p.id}>
                    {p.produto || p.nome} (Estoque atual: {Number.isFinite(estoque) ? estoque : 0})
                  </option>
                );
              })}
            </SelectComponent>
          </FormGroupComponent>

          <FormGroupComponent>
            <LabelComponent htmlFor={"quantidade"} text={"Quantidade *"}/>
            <InputComponent type="number" idName="quantidade" value={lancamento.quantidade} onChange={handleChange} placeholder="Digite a quantidade" min="1"/>
          </FormGroupComponent>

          {lancamento.tipo === "entrada" && (
            <FormGroupComponent>
              <LabelComponent htmlFor={"custo"} text={"Valor de Custo *"}/>
              <InputComponent idName={"custo"} type="number"
                placeholder={
                  custoAtual !== null
                    ? `Custo atual: R$ ${Number(custoAtual).toFixed(2)}`
                    : "Digite o novo valor de custo"
                }
                value={novoCusto} onChange={(e) => setNovoCusto(e.target.value)} min="0" step="0.01"
              />
            </FormGroupComponent>
          )} 

          {lancamento.tipo === "saida" && Number(valorOriginal) > 0 && (
            <>
              <FormGroupComponent>
                <LabelComponent htmlFor={"valorOriginal"} text={"Valor de Venda Atual"}/>
                <InputComponent idName={"valorOriginal"} type="text" value={`R$ ${Number(valorOriginal).toFixed(2)}`} disabled />
              </FormGroupComponent>

              <FormGroupComponent>
                <LabelComponent text={"Ajuste no Valor de Venda"}/>
                <div className="flex gap-[10px]">
                  <SelectComponent value={tipoAjuste} onChange={(e) => setTipoAjuste(e.target.value)}>
                    <option value="acrescimo">Acrescimo</option>
                    <option value="desconto">Desconto</option>
                  </SelectComponent>
                  <InputComponent type="number" placeholder="Valor" value={ajusteValor} onChange={(e) => setAjusteValor(e.target.value)}/>
                </div>
                <small className='mt-[5px] !text-[14px] max-sm:!text-xs font-normal block text-[#666666]'>
                  Valor final unitário: R$ {getValorFinalUnit().toFixed(2)}
                </small>
              </FormGroupComponent>
            </>
          )}

          {lancamento.tipo === "saida" && (
            <>
            <FormGroupComponent>
              <LabelComponent text={"Forma de pagamento"}/>
              <SelectComponent value={lancamento.formaPagamento} onChange={(e) => setLancamento((prev) => ({ ...prev, formaPagamento: e.target.value }))}>
                <option value="">Selecione...</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="pix">Pix</option>
                <option value="debito">Debito</option>
                <option value="credito">Credito</option>
              </SelectComponent>
            </FormGroupComponent>

            {lancamento.formaPagamento === "credito" && (
              <FormGroupComponent>
                <LabelComponent text={"Parcelas"}/>
                <InputComponent type="number" min="1" max="12" value={lancamento.parcelas} onChange={(e) => setLancamento((prev) => ({...prev, parcelas: Math.max(1, parseInt(e.target.value || "1", 10)),}))}/>
              </FormGroupComponent>
            )}
            </>
          )}

          <ButtonComponent text={"Lançar"} type="submit" disabled={loading || produtos.length === 0}/>
        </form>
      </div>
    </div>
  );
}
