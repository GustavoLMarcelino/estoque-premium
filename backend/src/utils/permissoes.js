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
  'comissoes',
  'garantia',
  'consulta_garantia',
  'emprestimos',
];

// Flag independente dos módulos: ver preço de custo (e lucro derivado dele)
// dentro de qualquer tela a que o usuário tenha acesso.
export const PERMISSAO_VER_CUSTO = 'ver_custo';

export const PERMISSOES_VALIDAS = new Set([...PERMISSOES_MODULOS, PERMISSAO_VER_CUSTO]);

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

/** Omite campos sensíveis (custo, percentual_lucro) para quem não pode ver custo. */
export function sanitizeCusto(item, user) {
  if (podeVerCusto(user)) return item;
  const { custo, percentual_lucro, ...pub } = item;
  return pub;
}
