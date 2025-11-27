import React, { useCallback, useEffect, useState } from 'react';
import { EstoqueAPI } from '../../services/estoque';
import TitleComponent from '../../components/TitleComponent';
import ErrorMsg from '../../components/ErrorMsgComponent';
import TableComponent from '../../components/TableComponent';
import { EstoqueSomAPI } from '../../services/estoqueSom';

const tabs = [
  { key: 'baterias', label: 'Baterias' },
  { key: 'som', label: 'Som' },
];

const currencyFormatter = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

function normalizeProduto(row) {
  const valorVenda = Number(row?.valor_venda ?? row?.valorVenda ?? row?.preco ?? 0);
  return {
    id: row?.id ?? `${row?.produto ?? row?.nome ?? 'produto'}-${row?.modelo ?? ''}`,
    produto: row?.produto ?? row?.nome ?? '',
    modelo: row?.modelo ?? '',
    valorVenda: Number.isFinite(valorVenda) ? valorVenda : 0,
  };
}

function formatCurrency(value) {
  return currencyFormatter.format(Number.isFinite(value) ? value : 0);
}

export default function TabelaPreco() {
  const [activeTab, setActiveTab] = useState('baterias');
  const [dataset, setDataset] = useState({
    baterias: { items: [], loading: false, error: '', loaded: false },
    som: { items: [], loading: false, error: '', loaded: false },
  });

  const fetchData = useCallback(async (tipo) => {
    // sempre faz fetch na troca da aba, evitando ficar travado em "Carregando"
    setDataset((prev) => ({
      ...prev,
      [tipo]: { ...(prev[tipo] || {}), loading: true, error: '' },
    }));

    try {
      const api = tipo === 'som' ? EstoqueSomAPI : EstoqueAPI;
      const data = await api.listar({ tipo });
      const rows = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : [];
      setDataset((prev) => ({
        ...prev,
        [tipo]: {
          items: rows.map(normalizeProduto),
          loading: false,
          loaded: true,
          error: '',
        },
      }));
    } catch (err) {
      const message = err?.response?.data?.message || err?.message || 'Falha ao carregar preços';
      setDataset((prev) => ({
        ...prev,
        [tipo]: {
          ...prev[tipo],
          loading: false,
          loaded: false,
          error: message,
        },
      }));
    }
  }, []);

  useEffect(() => {
    fetchData('baterias');
  }, [fetchData]);

  const handleTabChange = (key) => {
    setActiveTab(key);
    fetchData(key);
  };

  const current = dataset[activeTab] || dataset.baterias;
  const rows = current?.items ?? [];

  return (
    <div className="w-full h-[90vh] overflow-y-auto flex justify-center items-start">
      <div className="w-full bg-white rounded-[16px] p-[32px] shadow-[0px_15px_35px_rgba(15, 23, 42, 0.08)] flex flex-col gap-[20px]">
        <div className="flex items-end justify-between gap-[24px] max-[520px]:flex-wrap">
          <div>
            <TitleComponent text={"Tabela de Preços"}/>
            <p className="mt-[5px] text-[#666666] !text-[16px] max-sm:!text-xs font-normal block">Consulte rapidamente os valores praticados no estoque selecionado.</p>
          </div>
          <div className="flex gap-[12px] bg-[#f3f4f6] p-[6px] rounded-full">
            {tabs.map((tab) => (
              <button key={tab.key} type="button" className={`border-none text-[#4b5563] !text-base max-xl:!text-xs p-[10px_20px] rounded-full font-semibold cursor-pointer transition-all duration-200 whitespace-nowrap ${activeTab === tab.key ? 'bg-[#111827] text-white shadow-md' : 'bg-transparent text-gray-600 hover:bg-white/50 hover:text-gray-900'}`} onClick={() => handleTabChange(tab.key)}>{tab.label}</button>
            ))}
          </div>
        </div>

        {isBaterias && (
          <div className="bg-[#eef2ff] text-[#1d4ed8] border border-[#2563eb33] p-[12px_16px] rounded-[10px] !text-[16px] max-sm:!text-xs">Valor à vista aplica desconto automático de 10% sobre o valor cheio.</div>
        )}

        {current?.error && 
          <ErrorMsg errorMsg={current.error}/>
        }

        <div className='overflow-x-auto border border-[#e5e7eb] rounded-[12px] bg-white shadow-[0px_1px_6px_rgba(0,0,0,0.08)]'>
          <TableComponent
            columns={[
              {key: "produto", label: "Produto", render: (r) => r.modelo ? `${r.produto} - ${r.modelo}` : r.produto},
              {key: "valorVenda", label: "Valor Cheio", render: (r) => formatCurrency(r.valorVenda)},
              ...(isBaterias ? [{key: "valorVista", label: "Valor à Vista (-10%)", render: (r) => formatCurrency(r.valorVenda * 0.9)}] : [])
            ]}
            data={rows}
            noData={current?.loading && rows.length === 0 ? ("Carregando preços...") : "Nenhum produto cadastrado para este estoque."}
          />
        </div>
      </div>
    </div>
  );
}
