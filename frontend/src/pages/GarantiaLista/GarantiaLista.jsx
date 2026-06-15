import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  SearchCheck,
  Search,
  Eye,
  Printer,
  Trash2,
  ShieldOff,
  Plus,
} from "lucide-react";
import { GarantiasAPI } from "../../services/garantias";

const STATUS_FILTERS = [
  { value: "TODAS",      label: "Todas"        },
  { value: "ABERTA",     label: "Abertas"      },
  { value: "EM_ANALISE", label: "Em Análise"   },
  { value: "APROVADA",   label: "Resolvidas"   },
  { value: "REPROVADA",  label: "Negadas"      },
  { value: "FINALIZADA", label: "Finalizadas"  },
];

const STATUS_BADGE = {
  ABERTA:     { cls: "bg-blue-100 text-blue-700",       label: "Aberta"      },
  EM_ANALISE: { cls: "bg-amber-100 text-amber-700",     label: "Em Análise"  },
  APROVADA:   { cls: "bg-emerald-100 text-emerald-700", label: "Resolvida"   },
  REPROVADA:  { cls: "bg-red-100 text-red-700",         label: "Negada"      },
  FINALIZADA: { cls: "bg-slate-100 text-slate-600",     label: "Finalizada"  },
};

function limiteDateCls(dateStr) {
  if (!dateStr) return "text-slate-700";
  const diff = (new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24);
  if (diff < 0)   return "font-semibold text-red-600";
  if (diff <= 30) return "font-semibold text-amber-600";
  return "text-emerald-600";
}

function ActionBtn({ onClick, title, className, children }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${className}`}
    >
      {children}
    </button>
  );
}

export default function GarantiaLista() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [statusFilter, setStatusFilter] = useState("TODAS");

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      setErrorMsg("");
      try {
        const res = await GarantiasAPI.listar({ q, page: 1, pageSize: 200 });
        if (!alive) return;
        setRows(res.data || []);
      } catch (e) {
        if (!alive) return;
        console.error(e);
        setErrorMsg(e?.response?.data?.message || "Falha ao carregar garantias");
      } finally {
        if (alive) setLoading(false);
      }
    }
    const t = setTimeout(load, 300);
    return () => { alive = false; clearTimeout(t); };
  }, [q]);

  const filtered = useMemo(
    () => statusFilter === "TODAS" ? rows : rows.filter((r) => r.status === statusFilter),
    [rows, statusFilter],
  );

  async function handleDelete(id) {
    if (!window.confirm("Deseja excluir esta garantia? Esta ação não pode ser desfeita.")) return;
    try {
      await GarantiasAPI.deletar(id);
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      alert(e?.response?.data?.message || "Não foi possível excluir a garantia.");
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:p-6">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
              <SearchCheck size={24} strokeWidth={2.2} />
            </span>
            <div>
              <h1 className="text-xl font-bold text-slate-800 md:text-2xl">
                Consulta de Garantias
              </h1>
              <p className="text-sm text-slate-500">
                Pesquise e gerencie as garantias cadastradas
              </p>
            </div>
          </div>

          <Link
            to="/garantia"
            className="flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-amber-500"
          >
            <Plus size={16} strokeWidth={2.5} />
            Nova Garantia
          </Link>
        </div>

        {errorMsg && (
          <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {errorMsg}
          </div>
        )}

        {/* Search */}
        <div className="mt-5 relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
          />
          <input
            type="text"
            placeholder="Buscar por cliente, documento, produto..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="w-full rounded-lg border border-slate-300 py-2.5 pl-10 pr-4 text-sm text-slate-800 outline-none placeholder:text-slate-400 focus:border-amber-400 focus:ring-2 focus:ring-amber-200"
          />
        </div>

        {/* Filter pills */}
        <div className="mt-3 flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => {
            const active = statusFilter === f.value;
            return (
              <button
                key={f.value}
                type="button"
                onClick={() => setStatusFilter(f.value)}
                className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                  active
                    ? "bg-amber-400 text-slate-900 shadow-sm"
                    : "border border-amber-300 bg-white text-amber-600 hover:bg-amber-50"
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Table */}
        <div className="mt-5 overflow-hidden rounded-2xl ring-1 ring-slate-200 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-slate-800 text-left text-xs font-semibold uppercase tracking-wide text-white">
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Documento</th>
                  <th className="px-4 py-3">Telefone</th>
                  <th className="px-4 py-3">Produto</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Abertura</th>
                  <th className="px-4 py-3">Limite</th>
                  <th className="px-4 py-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-400">
                      Carregando garantias...
                    </td>
                  </tr>
                )}

                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-16">
                      <div className="flex flex-col items-center justify-center gap-3 text-center">
                        <ShieldOff size={44} strokeWidth={1.4} className="text-slate-300" />
                        <p className="text-sm font-medium text-slate-500">
                          Nenhuma garantia encontrada.
                        </p>
                        <Link
                          to="/garantia"
                          className="mt-1 flex items-center gap-2 rounded-xl bg-amber-400 px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-amber-500 transition-colors"
                        >
                          <Plus size={15} strokeWidth={2.5} />
                          Cadastrar primeira garantia
                        </Link>
                      </div>
                    </td>
                  </tr>
                )}

                {!loading && filtered.map((r) => {
                  const badge = STATUS_BADGE[r.status] ?? { cls: "bg-slate-100 text-slate-600", label: r.status };
                  return (
                    <tr
                      key={r.id}
                      className="border-t border-slate-100 odd:bg-white even:bg-slate-50/60 transition-colors hover:bg-amber-50/40"
                    >
                      <td className="px-4 py-3 font-medium text-slate-800">{r.cliente_nome}</td>
                      <td className="px-4 py-3 text-slate-600">{r.cliente_documento}</td>
                      <td className="px-4 py-3 text-slate-600">{r.cliente_telefone}</td>
                      <td className="px-4 py-3 text-slate-700">
                        {r.produto_codigo}
                        {r.produto_descricao ? ` – ${r.produto_descricao}` : ""}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {r.data_abertura
                          ? new Date(r.data_abertura).toLocaleDateString("pt-BR")
                          : "—"}
                      </td>
                      <td className={`px-4 py-3 ${limiteDateCls(r.data_limite)}`}>
                        {r.data_limite
                          ? new Date(r.data_limite).toLocaleDateString("pt-BR")
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-center gap-1">
                          <ActionBtn
                            title="Visualizar / Editar"
                            onClick={() => navigate(`/garantia/${r.id}`)}
                            className="bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-800"
                          >
                            <Eye size={14} />
                          </ActionBtn>
                          <ActionBtn
                            title="Imprimir termo"
                            onClick={() => window.open(`/garantia/${r.id}`, "_blank")}
                            className="bg-blue-50 text-blue-600 hover:bg-blue-100"
                          >
                            <Printer size={14} />
                          </ActionBtn>
                          <ActionBtn
                            title="Excluir garantia"
                            onClick={() => handleDelete(r.id)}
                            className="bg-red-50 text-red-500 hover:bg-red-100 hover:text-red-700"
                          >
                            <Trash2 size={14} />
                          </ActionBtn>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
