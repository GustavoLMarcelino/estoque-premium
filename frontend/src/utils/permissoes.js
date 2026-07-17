// Catálogo de permissões — ESPELHO do backend (backend/src/utils/permissoes.js,
// fonte única). Cobre só as telas operacionais; telas administrativas
// (Cadastro, Classes do Som, Usuários) são exclusivas de role=admin e não
// entram como checkbox. Chave ausente = false; admin bypassa tudo.

// Agrupamento igual ao do sidebar — usado no grid de checkboxes da página
// de usuários e na filtragem do menu.
export const GRUPOS_PERMISSOES = [
  {
    titulo: 'Principal',
    itens: [{ key: 'home', label: 'Home' }],
  },
  {
    titulo: 'Estoque e Preços',
    itens: [
      { key: 'estoque_baterias', label: 'Estoque Baterias' },
      { key: 'estoque_som', label: 'Estoque Som' },
      { key: 'orcamento', label: 'Orçamento' },
      { key: 'tabela_precos', label: 'Tabela de Preços' },
    ],
  },
  {
    titulo: 'Operação',
    itens: [
      { key: 'entrada_saida', label: 'Entrada e Saída' },
      { key: 'reg_movimentacao', label: 'Reg. Movimentação' },
      { key: 'dashboards', label: 'Dashboards' },
      // 'comissoes' saiu do catálogo — a tela é admin-only (junto de Cadastro,
      // Classes do Som, Usuários). Chave residual no JSON é ignorada.
    ],
  },
  {
    titulo: 'Garantia',
    itens: [
      { key: 'garantia', label: 'Garantia' },
      { key: 'consulta_garantia', label: 'Consulta Garantia' },
      { key: 'emprestimos', label: 'Baterias Emprestadas' },
    ],
  },
];

export const TODAS_PERMISSOES_MODULOS = GRUPOS_PERMISSOES.flatMap((g) => g.itens.map((i) => i.key));

export const VER_CUSTO = 'ver_custo';

// Escopo de LINHA de produto — eixo ortogonal às telas (mesmo JSON permissoes).
// Acesso efetivo a uma tela/endpoint de linha = permissão da tela E (linha ∈
// linhas do usuário). Ver Estoque Som exige estoque_som E linha_som.
export const LINHA_BATERIAS = 'linha_baterias';
export const LINHA_SOM = 'linha_som';
export const LINHAS = [
  { key: LINHA_BATERIAS, label: 'Baterias' },
  { key: LINHA_SOM, label: 'Som' },
];

// Catálogo completo de chaves válidas (espelha PERMISSOES_VALIDAS do backend) —
// usado para filtrar chaves residuais antes de um PATCH de usuário.
export const CHAVES_VALIDAS = new Set([
  ...TODAS_PERMISSOES_MODULOS,
  ...LINHAS.map((l) => l.key),
  VER_CUSTO,
]);

// Rota → { perm, linha } (na MESMA ordem do sidebar: a primeira rota permitida
// é o destino do redirect pós-login / rota negada). linha ausente = transversal.
export const ROTAS_MODULO = [
  ['/home', 'home'],
  ['/estoque-baterias', 'estoque_baterias', 'baterias'],
  ['/estoque-som', 'estoque_som', 'som'],
  ['/orcamento', 'orcamento', 'som'],
  ['/tabela-precos', 'tabela_precos'],
  ['/entrada-saida', 'entrada_saida'],
  ['/reg-movimentacao', 'reg_movimentacao'],
  ['/dashboards', 'dashboards', 'baterias'],
  ['/garantia', 'garantia', 'baterias'],
  ['/garantia-con', 'consulta_garantia', 'baterias'],
  ['/emprestimos', 'emprestimos', 'baterias'],
];
