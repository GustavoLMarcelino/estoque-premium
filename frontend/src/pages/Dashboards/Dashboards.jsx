// src/pages/Dashboards/Dashboards.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { MovAPI } from '../../services/movimentacoes';
import { EstoqueAPI } from '../../services/estoque';

const card = { padding: 16, border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' };
const row = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 };
const h2 = { margin: '8px 0 12px', color: '#111827' };

const FEES_KEY = 'feesConfig'; // { debitoPct, creditoAVistaPct, creditoParceladoPct }

function loadJson(key, fallback) { try { return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback)); } catch { return fallback; } }

export default function Dashboards() {
  const [movs, setMovs] = useState([]);
  const [prods, setProds] = useState([]);
  const [fees, setFees] = useState(()=> loadJson(FEES_KEY, { debitoPct: 1.89, creditoAVistaPct: 4.49, creditoParceladoPct: 1.99 }));

  useEffect(()=>{
    (async ()=>{
      try {
        const [m, p] = await Promise.all([
          MovAPI.listar({ page: 1, pageSize: 1000 }),
          EstoqueAPI.listar({ q: '' })
        ]);
        setMovs(Array.isArray(m) ? m : []);
        setProds(Array.isArray(p) ? p : []);
      } catch (e) {
        console.error('Dash fetch error', e);
      }
    })();
  }, []);

  // maps
  const prodMap = useMemo(()=> {
    const map = new Map();
    for (const x of prods || []) map.set(Number(x.id), x);
    return map;
  }, [prods]);

  const pagamentos = useMemo(()=> loadJson('movPagamentos', {}), []);

  const resumo = useMemo(()=> {
    let vendasBrutas = 0, custoVendido = 0, taxas = 0;
    let qtdVendas = 0;

    for (const mv of movs || []) {
      const tipo = String(mv.tipo || '').toLowerCase();
      if (tipo !== 'saida') continue;

      const prod = prodMap.get(Number(mv.produto_id));
      const qtd = Number(mv.quantidade || 0);
      const custo = qtd * Number(prod?.custo || 0);
      const receita = Number(mv.valor_final || 0) * qtd; // valor_final é unitário no seu fluxo
      vendasBrutas += receita;
      custoVendido += custo;
      qtdVendas += qtd;

      // taxas
      const meta = pagamentos[String(mv.id)] || {};
      let t = 0;
      const f = (fees || {});
      if (meta.forma === 'debito') t = receita * (Number(f.debitoPct || 0)/100);
      else if (meta.forma === 'credito') {
        if (Number(meta.parcelas || 1) > 1) {
          t = receita * (Number(f.creditoParceladoPct || 0)/100) * Number(meta.parcelas || 1);
        } else {
          t = receita * (Number(f.creditoAVistaPct || 0)/100);
        }
      } else {
        t = 0; // dinheiro/pix
      }
      taxas += t;
    }

    const lucroBruto = vendasBrutas - custoVendido;
    const lucroLiquido = lucroBruto - taxas;
    return { vendasBrutas, custoVendido, taxas, lucroBruto, lucroLiquido, qtdVendas };
  }, [movs, prodMap, pagamentos, fees]);

  function saveFees() {
    localStorage.setItem(FEES_KEY, JSON.stringify(fees));
    alert('Taxas salvas!');
  }

  return (
    <div style={{ padding: 16 }}>
      <h2 style={h2}>📊 Dashboards</h2>

      <div style={row}>
        <div style={card}>
          <h3>Resumo</h3>
          <ul>
            <li><strong>Receita bruta:</strong> R$ {resumo.vendasBrutas.toFixed(2)}</li>
            <li><strong>Custo dos vendidos:</strong> R$ {resumo.custoVendido.toFixed(2)}</li>
            <li><strong>Taxas de máquina:</strong> R$ {resumo.taxas.toFixed(2)}</li>
            <li><strong>Lucro bruto:</strong> R$ {resumo.lucroBruto.toFixed(2)}</li>
            <li><strong>Lucro líquido:</strong> R$ {resumo.lucroLiquido.toFixed(2)}</li>
            <li><strong>Qtd vendida:</strong> {resumo.qtdVendas}</li>
          </ul>
        </div>

        <div style={card}>
          <h3>Configurar Taxas</h3>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap: 8 }}>
            <label>Débito (%)</label>
            <input type="number" step="0.01" value={fees.debitoPct}
              onChange={(e)=>setFees(prev=>({ ...prev, debitoPct: Number(e.target.value) }))} />
            <label>Crédito à vista (%)</label>
            <input type="number" step="0.01" value={fees.creditoAVistaPct}
              onChange={(e)=>setFees(prev=>({ ...prev, creditoAVistaPct: Number(e.target.value) }))} />
            <label>Crédito parcelado (por parcela %) </label>
            <input type="number" step="0.01" value={fees.creditoParceladoPct}
              onChange={(e)=>setFees(prev=>({ ...prev, creditoParceladoPct: Number(e.target.value) }))} />
          </div>
          <button onClick={saveFees} style={{ marginTop: 12 }}>Salvar</button>
        </div>
      </div>
    </div>
  );
}
