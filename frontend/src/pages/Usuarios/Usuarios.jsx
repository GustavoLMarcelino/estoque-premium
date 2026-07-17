// Gerenciamento de usuários e permissões (tela exclusiva do admin — a rota é
// adminOnly e o backend exige requireAdmin em todos os endpoints).
// Modelo: checkboxes livres por tela operacional + flag independente de custo.
import React, { useEffect, useMemo, useState } from "react";
import {
  Users, UserPlus, Mail, Lock, Loader2, Trash2, Pencil, Check, X,
  ShieldCheck, DollarSign, ChevronUp,
} from "lucide-react";
import { UsuariosAPI } from "../../services/usuarios";
import { GRUPOS_PERMISSOES, TODAS_PERMISSOES_MODULOS, VER_CUSTO, LINHAS, CHAVES_VALIDAS } from "../../utils/permissoes";
import { useToast } from "../../components/ui/Toast";
import { useConfirm } from "../../components/ui/ConfirmDialog";

const permissoesVazias = () => ({});

/** Grid de checkboxes das telas operacionais + checkbox destacado de custo. */
function PermissoesGrid({ value, onChange, idPrefix }) {
  const marcadas = TODAS_PERMISSOES_MODULOS.filter((k) => value[k] === true).length;
  const todasMarcadas = marcadas === TODAS_PERMISSOES_MODULOS.length;

  function toggle(key) {
    onChange({ ...value, [key]: !(value[key] === true) });
  }
  function marcarTodas() {
    const next = { ...value };
    for (const k of TODAS_PERMISSOES_MODULOS) next[k] = !todasMarcadas;
    onChange(next);
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-700">Acesso às telas</span>
        <button
          type="button"
          onClick={marcarTodas}
          className="text-xs font-medium text-amber-600 hover:text-amber-700"
        >
          {todasMarcadas ? "Desmarcar todas" : "Marcar todas"}
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {GRUPOS_PERMISSOES.map((grupo) => (
          <fieldset key={grupo.titulo} className="rounded-xl border border-slate-200 p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
              {grupo.titulo}
            </legend>
            <div className="space-y-2">
              {grupo.itens.map(({ key, label }) => (
                <label key={key} htmlFor={`${idPrefix}-${key}`} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <input
                    id={`${idPrefix}-${key}`}
                    type="checkbox"
                    checked={value[key] === true}
                    onChange={() => toggle(key)}
                    className="h-4 w-4 rounded border-slate-300 text-amber-500 accent-amber-500"
                  />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>

      {/* Escopo de linha de produto — eixo ortogonal às telas (TETO com AND).
          Sem a linha, ela some de tudo mesmo com a permissão de tela marcada. */}
      <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-400">
          Linhas de produto
        </span>
        <div className="flex flex-wrap gap-4">
          {LINHAS.map(({ key, label }) => (
            <label key={key} htmlFor={`${idPrefix}-${key}`} className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
              <input
                id={`${idPrefix}-${key}`}
                type="checkbox"
                checked={value[key] === true}
                onChange={() => toggle(key)}
                className="h-4 w-4 rounded border-slate-300 text-amber-500 accent-amber-500"
              />
              {label}
            </label>
          ))}
        </div>
        <span className="mt-1.5 block text-xs text-slate-500">
          Telas de uma linha (Estoque, Orçamento, Dashboards, Garantia…) exigem a linha
          correspondente; nas telas mistas, só a(s) linha(s) marcada(s) aparecem.
        </span>
      </div>

      {/* Permissão especial, independente dos módulos */}
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
        <label htmlFor={`${idPrefix}-${VER_CUSTO}`} className="flex cursor-pointer items-start gap-3">
          <input
            id={`${idPrefix}-${VER_CUSTO}`}
            type="checkbox"
            checked={value[VER_CUSTO] === true}
            onChange={() => toggle(VER_CUSTO)}
            className="mt-0.5 h-4 w-4 rounded border-amber-300 accent-amber-500"
          />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-800">
              <DollarSign size={15} /> Ver preços de custo
            </span>
            <span className="mt-0.5 block text-xs text-amber-700">
              Independente das telas: sem esta permissão, custo e lucro não aparecem em
              nenhuma tela nem nas respostas da API para este usuário.
            </span>
          </span>
        </label>
      </div>
    </div>
  );
}

function ResumoPermissoes({ permissoes, role }) {
  if (role === "admin") {
    return <span className="inline-flex items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-xs font-medium text-white"><ShieldCheck size={12} /> Acesso total</span>;
  }
  const labels = GRUPOS_PERMISSOES.flatMap((g) => g.itens).filter((i) => permissoes?.[i.key] === true).map((i) => i.label);
  const linhas = LINHAS.filter((l) => permissoes?.[l.key] === true).map((l) => l.label);
  return (
    <span className="text-xs text-slate-500">
      {labels.length ? labels.join(", ") : "Nenhuma tela liberada"}
      {linhas.length > 0 && (
        <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-slate-200 px-1.5 py-0.5 font-medium text-slate-600">
          {linhas.join(" + ")}
        </span>
      )}
      {permissoes?.[VER_CUSTO] === true && (
        <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700">
          <DollarSign size={11} /> vê custo
        </span>
      )}
    </span>
  );
}

export default function Usuarios() {
  const toast = useToast();
  const confirm = useConfirm();

  const [usuarios, setUsuarios] = useState([]);
  const [carregando, setCarregando] = useState(true);

  // form de criação
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [perms, setPerms] = useState(permissoesVazias);
  const [salvando, setSalvando] = useState(false);

  // edição inline (um usuário expandido por vez)
  const [editId, setEditId] = useState(null);
  const [editPerms, setEditPerms] = useState(permissoesVazias);
  const [salvandoEdit, setSalvandoEdit] = useState(false);

  const emailValido = useMemo(() => /\S+@\S+\.\S+/.test(email), [email]);

  async function carregar() {
    try {
      setCarregando(true);
      setUsuarios(await UsuariosAPI.listar());
    } catch {
      toast.error("Não foi possível carregar os usuários.");
    } finally {
      setCarregando(false);
    }
  }
  useEffect(() => { carregar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function criar(e) {
    e.preventDefault();
    if (nome.trim().length < 2) { toast.error("Informe o nome (mínimo 2 letras)."); return; }
    if (!emailValido) { toast.error("Informe um e-mail válido."); return; }
    if (senha.length < 8) { toast.error("A senha deve ter pelo menos 8 caracteres."); return; }
    try {
      setSalvando(true);
      await UsuariosAPI.criar({ name: nome.trim(), email: email.trim(), password: senha, permissoes: perms });
      toast.success("Usuário criado.");
      setNome(""); setEmail(""); setSenha(""); setPerms(permissoesVazias());
      carregar();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Falha ao criar usuário.");
    } finally {
      setSalvando(false);
    }
  }

  function abrirEdicao(u) {
    setEditId(u.id);
    // Filtra chaves fora do catálogo (ex.: 'comissoes' residual) — senão o PATCH
    // reenviaria a chave desconhecida e o backend rejeitaria com 400.
    const limpo = {};
    for (const [k, v] of Object.entries(u.permissoes || {})) {
      if (CHAVES_VALIDAS.has(k)) limpo[k] = v;
    }
    setEditPerms(limpo);
  }

  async function salvarEdicao(u) {
    try {
      setSalvandoEdit(true);
      await UsuariosAPI.atualizar(u.id, { permissoes: editPerms });
      toast.success(`Permissões de ${u.name} atualizadas.`);
      setEditId(null);
      carregar();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Falha ao salvar permissões.");
    } finally {
      setSalvandoEdit(false);
    }
  }

  async function excluir(u) {
    const ok = await confirm({
      title: "Excluir usuário",
      message: `Excluir "${u.name}" (${u.email})? O acesso é revogado imediatamente.`,
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
    });
    if (!ok) return;
    try {
      await UsuariosAPI.excluir(u.id);
      toast.success("Usuário excluído.");
      carregar();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Falha ao excluir usuário.");
    }
  }

  const inputCls =
    "w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 " +
    "outline-none transition focus:border-amber-400 focus:ring-2 focus:ring-amber-400/30";

  return (
    <div className="min-h-screen bg-slate-100 p-4 md:p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* ── Card: Novo Usuário ─────────────────────────────── */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
              <UserPlus size={24} strokeWidth={2.2} />
            </span>
            <div>
              <h1 className="text-lg font-bold text-slate-800">Novo Usuário</h1>
              <p className="text-sm text-slate-500">
                Crie o acesso e marque as telas que este usuário poderá usar.
              </p>
            </div>
          </div>

          <form onSubmit={criar} className="mt-5 space-y-5">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-600">Nome *</span>
                <input className={inputCls} value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Nome do funcionário" />
              </label>
              <label className="block">
                <span className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-600"><Mail size={14} /> E-mail *</span>
                <input className={inputCls} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@exemplo.com" />
              </label>
              <label className="block">
                <span className="mb-1 flex items-center gap-1 text-sm font-medium text-slate-600"><Lock size={14} /> Senha *</span>
                <input className={inputCls} type="password" value={senha} onChange={(e) => setSenha(e.target.value)} placeholder="Mínimo 8 caracteres" autoComplete="new-password" />
              </label>
            </div>

            <PermissoesGrid value={perms} onChange={setPerms} idPrefix="novo" />

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={salvando}
                className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-amber-600 disabled:opacity-60"
              >
                {salvando ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                Criar usuário
              </button>
            </div>
          </form>
        </section>

        {/* ── Card: Usuários cadastrados ─────────────────────── */}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 md:p-6">
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-500">
              <Users size={24} strokeWidth={2.2} />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Usuários cadastrados</h2>
              <p className="text-sm text-slate-500">Edite permissões ou remova acessos — vale na hora.</p>
            </div>
          </div>

          {carregando ? (
            <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
              <Loader2 size={18} className="animate-spin" /> Carregando…
            </div>
          ) : (
            <ul className="mt-4 divide-y divide-slate-100">
              {usuarios.map((u) => {
                const emEdicao = editId === u.id;
                const isAdminUser = u.role === "admin";
                return (
                  <li key={u.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="truncate font-medium text-slate-800">{u.name}</span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
                              isAdminUser ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {u.role}
                          </span>
                        </div>
                        <div className="truncate text-sm text-slate-500">{u.email}</div>
                        <div className="mt-1">
                          <ResumoPermissoes permissoes={u.permissoes} role={u.role} />
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {!isAdminUser && (
                          <button
                            onClick={() => (emEdicao ? setEditId(null) : abrirEdicao(u))}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50"
                            title="Editar permissões"
                          >
                            {emEdicao ? <ChevronUp size={14} /> : <Pencil size={14} />}
                            {emEdicao ? "Fechar" : "Permissões"}
                          </button>
                        )}
                        {!isAdminUser && (
                          <button
                            onClick={() => excluir(u)}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 transition hover:bg-red-50"
                            title="Excluir usuário"
                          >
                            <Trash2 size={14} /> Excluir
                          </button>
                        )}
                      </div>
                    </div>

                    {emEdicao && (
                      <div className="mt-4 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                        <PermissoesGrid value={editPerms} onChange={setEditPerms} idPrefix={`edit-${u.id}`} />
                        <div className="mt-4 flex justify-end gap-2">
                          <button
                            onClick={() => setEditId(null)}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
                          >
                            <X size={15} /> Cancelar
                          </button>
                          <button
                            onClick={() => salvarEdicao(u)}
                            disabled={salvandoEdit}
                            className="inline-flex items-center gap-1 rounded-xl bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-60"
                          >
                            {salvandoEdit ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
                            Salvar permissões
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
              {usuarios.length === 0 && (
                <li className="py-8 text-center text-sm text-slate-400">Nenhum usuário cadastrado.</li>
              )}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
