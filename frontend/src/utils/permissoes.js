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
      { key: 'comissoes', label: 'Comissões' },
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

// Rota → permissão de módulo (na MESMA ordem do sidebar: a primeira rota
// permitida é o destino do redirect pós-login / rota negada).
export const ROTAS_MODULO = [
  ['/home', 'home'],
  ['/estoque-baterias', 'estoque_baterias'],
  ['/estoque-som', 'estoque_som'],
  ['/orcamento', 'orcamento'],
  ['/tabela-precos', 'tabela_precos'],
  ['/entrada-saida', 'entrada_saida'],
  ['/reg-movimentacao', 'reg_movimentacao'],
  ['/dashboards', 'dashboards'],
  ['/comissoes', 'comissoes'],
  ['/garantia', 'garantia'],
  ['/garantia-con', 'consulta_garantia'],
  ['/emprestimos', 'emprestimos'],
];
