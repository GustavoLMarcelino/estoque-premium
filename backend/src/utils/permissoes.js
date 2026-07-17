// Catálogo de permissões granulares — FONTE ÚNICA no backend (o frontend
// espelha em frontend/src/utils/permissoes.js). Cobre apenas as telas
// OPERACIONAIS: telas administrativas (Cadastro de produto, Classes do Som,
// config de Comissão, gerenciamento de usuários) permanecem restritas a
// role=admin e NÃO viram checkbox.
//
// Armazenamento: coluna user.permissoes (string JSON de booleans).
// Chave ausente = false. role=admin bypassa tudo.

export const PERMISSOES_MODULOS = [
  'home',
  'estoque_baterias',
  'estoque_som',
  'orcamento',
  'tabela_precos',
  'entrada_saida',
  'reg_movimentacao',
  'dashboards',
  'garantia',
  'consulta_garantia',
  'emprestimos',
];
// Comissão saiu do catálogo: a tela /comissoes e /api/comissao são admin-only.
// Chave 'comissoes' residual em algum JSON deixa de ser atendida (e a validação
// de POST/PATCH passa a rejeitá-la como desconhecida) — sem migração.

// Flag independente dos módulos: ver preço de custo (e lucro derivado dele)
// dentro de qualquer tela a que o usuário tenha acesso.
export const PERMISSAO_VER_CUSTO = 'ver_custo';

// Escopo de LINHA de produto — eixo ortogonal às telas. Acesso efetivo a uma
// tela/endpoint de linha = permissão da tela E (linha ∈ linhas do usuário).
// É o TETO: sem linha_som, Som some de tudo mesmo com a permissão de tela
// marcada. Admin bypassa. Chaves ficam no MESMO JSON permissoes (sem schema).
export const PERMISSAO_LINHA_BATERIAS = 'linha_baterias';
export const PERMISSAO_LINHA_SOM = 'linha_som';
export const PERMISSOES_LINHAS = [PERMISSAO_LINHA_BATERIAS, PERMISSAO_LINHA_SOM];

export const PERMISSOES_VALIDAS = new Set([
  ...PERMISSOES_MODULOS,
  ...PERMISSOES_LINHAS,
  PERMISSAO_VER_CUSTO,
]);

/** Parse defensivo da coluna user.permissoes — nunca lança, nunca devolve não-objeto. */
export function parsePermissoes(raw) {
  if (raw && typeof raw === 'object') return raw;
  try {
    const obj = JSON.parse(raw || '{}');
    return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
  } catch {
    return {};
  }
}

/** true se o usuário é admin OU tem QUALQUER uma das permissões (OR). */
export function temPermissao(user, ...keys) {
  if (user?.role === 'admin') return true;
  const perms = user?.permissoes || {};
  return keys.some((k) => perms[k] === true);
}

export function podeVerCusto(user) {
  return temPermissao(user, PERMISSAO_VER_CUSTO);
}

/** true se o usuário pode operar a linha ('baterias'|'som'). Admin bypassa.
 *  A chave no JSON é linha_<linha> (ex.: linha_som). */
export function podeVerLinha(user, linha) {
  if (user?.role === 'admin') return true;
  const key = linha === 'som' ? PERMISSAO_LINHA_SOM : PERMISSAO_LINHA_BATERIAS;
  return (user?.permissoes || {})[key] === true;
}

/** Omite campos sensíveis (custo, percentual_lucro) para quem não pode ver custo. */
export function sanitizeCusto(item, user) {
  if (podeVerCusto(user)) return item;
  const { custo, percentual_lucro, ...pub } = item;
  return pub;
}
