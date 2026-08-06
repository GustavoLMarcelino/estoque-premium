# Dashboard e agregações

Este documento descreve os endpoints que produzem números consolidados — faturamento, lucro, valor imobilizado, produtos críticos — e as decisões de escopo que definem o que cada número significa. Serve para quem for consumir esses dados numa tela nova ou alterar a definição de algum indicador.

Pressupõe os conceitos de [ARQUITETURA.md](ARQUITETURA.md): linha de produto, permissões e estoque como agregado.

---

## Índice

- [Princípio: agregação no servidor](#princípio-agregação-no-servidor)
- [`/api/vendas-resumo`](#apivendas-resumo)
- [Definição de receita por linha](#definição-de-receita-por-linha)
- [Decisões de escopo do lucro](#decisões-de-escopo-do-lucro)
- [`/api/estoque-resumo`](#apiestoque-resumo)
- [Paginação e o campo `pageSizeSolicitado`](#paginação-e-o-campo-pagesizesolicitado)
- [Componente de carrossel](#componente-de-carrossel)

---

## Princípio: agregação no servidor

Todo indicador do sistema é calculado no servidor. A regra existe por dois motivos independentes, e ambos produziram bugs reais.

**Sigilo.** O custo de um produto não pode sair da API para quem não tem `ver_custo`. Como `sanitizeCusto` remove o campo das listagens, uma tela jamais teria como somar o custo imobilizado no cliente — o dado simplesmente não chega.

**Truncamento silencioso.** As rotas de listagem limitam `pageSize` (100 na maioria, 200 em garantias). Somar no cliente sobre uma lista paginada produz um número menor que a realidade, sem erro e sem aviso. Três indicadores da tela inicial sofreram exatamente isso:

| Indicador | Origem anterior | Erro observado em produção |
|---|---|---|
| Valor Total | soma no cliente sobre `/api/estoque?pageSize=500` (servido: 100) | R$ 198.956,41 exibido contra R$ 247.031,09 reais |
| Vendas da Semana | soma no cliente sobre 20 movimentações por linha | R$ 9.342,60 exibido contra R$ 15.407,99 reais |
| Produtos Críticos | filtro no cliente sobre catálogo cortado em 100 | 39 exibidos contra 41 reais |

Com 148 produtos na linha Som contra um teto de 100, o corte era estrutural: os produtos mais antigos nunca entravam na conta.

---

## `/api/vendas-resumo`

Resumo de faturamento das duas linhas num payload só. Alimenta o dashboard e o indicador de vendas da semana.

### Requisição

```http
GET /api/vendas-resumo?from=2026-08-01&to=2026-08-31
```

| Parâmetro | Formato | Efeito |
|---|---|---|
| `from` | `YYYY-MM-DD` ou ISO 8601 | Início do recorte. Data pura ancora em `00:00:00.000Z` |
| `to` | `YYYY-MM-DD` ou ISO 8601 | Fim do recorte. Data pura ancora em `23:59:59.999Z` — cobre o dia inteiro |

Ambos são **opcionais**. Omitidos, o endpoint agrega todo o histórico, que é o comportamento consumido pelo dashboard.

O schema usa `.strict()`: uma chave desconhecida — `?form=` no lugar de `?from=` — retorna `400` em vez de responder o histórico inteiro com aparência de resumo do período. O formato de data também é exigido por expressão regular, e não delegado ao construtor `Date`: `new Date('10/08/2026')` **não** falha em JavaScript, resolve como 8 de outubro no formato americano. Quem digitasse 10 de agosto receberia outro mês sem aviso.

### Resposta

```json
{
  "data": {
    "total":    { "vendasBrutas": 15407.99, "qtdVendas": 24, "taxas": 812.44, "...": "..." },
    "baterias": { "vendasBrutas": 10684.90, "...": "..." },
    "som":      { "vendasBrutas":  4723.09, "...": "..." }
  }
}
```

Cada bloco contém:

| Campo | Conteúdo | Visível sem `ver_custo` |
|---|---|---|
| `vendasBrutas` | Receita do período | ✅ |
| `qtdVendas` | Unidades de produto vendidas | ✅ |
| `taxas` | Taxa de maquininha, somada **por venda** | ✅ |
| `vendasSemForma` | `{ qtd, receita }` de vendas sem forma de pagamento utilizável | ✅ |
| `seriePorDia` | `[{ dia, receita }]`, ordenado | ✅ |
| `custoVendido` | Custo dos produtos vendidos | ❌ |
| `lucroBruto` | `vendasBrutas − custoVendido` | ❌ |
| `lucroLiquido` | `lucroBruto − taxas` | ❌ |

O bloco `som` traz ainda `qtdPedidos`, `receitaProdutos`, `receitaMaoObra` e `saidasSemPedido`. Esses campos **não** entram no `total`: não fazem sentido somados a Baterias.

**Linha fora do escopo do usuário vem `null`** e não entra no total. Ausência de `custoVendido` significa "não pode ver", nunca zero.

O `total` é calculado a partir dos acumuladores **crus**, não da soma dos blocos já arredondados — assim `lucroBruto` do total fecha exatamente com `vendasBrutas − custoVendido` do próprio total.

---

## Definição de receita por linha

As duas linhas têm fontes de receita diferentes, e confundi-las é o erro mais caro possível neste código.

### Baterias

Uma venda é uma **movimentação de `SAIDA`**. `valor_final` é unitário, então a receita é `valor_final × quantidade`.

```javascript
where: { tipo: 'SAIDA', garantia_id: null, /* + recorte de período */ }
```

O filtro `garantia_id: null` exclui empréstimos de garantia. Não é venda: é saída temporária de uma bateria cedida ao cliente. Sem esse filtro, a saída do empréstimo (com `valor_final` zero e custo maior que zero) entraria como prejuízo e nunca seria compensada.

### Som

Uma venda é um **`pedido_som`**, e a receita é `valor_total` — peças mais mão de obra.

As `movimentacoes_som` geradas pelo pedido são **baixa de estoque, não receita**. Contá-las dobraria o faturamento. Saídas avulsas de Som (sem pedido, com `motivo` nulo) ficam fora do faturamento e são sinalizadas à parte, em `saidasSemPedido`.

> Um indicador que somava `movimentacoes_som` como receita subnotificava R$ 1.080,00 numa única semana, porque as movimentações carregam apenas as peças — a mão de obra não aparece nelas.

---

## Decisões de escopo do lucro

Três decisões definem o modelo e estão fixadas no código.

**Comissão fica fora do lucro.** `lucro = receita − custo − taxa`. Nenhuma comissão entra na conta, em nenhuma das linhas. Comissão é apuração própria, com período e regras diferentes, e vive em `/api/comissao` (ver [ARQUITETURA.md](ARQUITETURA.md#comissão)).

**Custo é o atual do produto, não um snapshot da venda.** `estoque.custo` e `estoque_som.custo` são lidos no momento da consulta. As duas linhas herdam a mesma limitação: **alterar o custo de um produto reescreve o lucro histórico dele**. Um snapshot por venda resolveria, mas exigiria coluna nova e backfill.

**Taxa é calculada por venda, nunca sobre o agregado.** Cada venda tem sua taxa truncada ao centavo por componente e só então somada. Somar as receitas e taxar o total daria centavos diferentes.

Uma proteção associada: crédito **sem** número de parcelas não é taxado — vai para `vendasSemForma`. A função de taxa faria `Math.trunc(Number(parcelas) || 1)`, tratando parcelas nulas como 1x (cerca de 3,43%) num pedido que pode ter sido 10x (cerca de 12,75%). Seriam quase 9,3 pontos de erro com aparência de exatidão.

---

## `/api/estoque-resumo`

Três rotas com o mesmo formato de três faces — `total`, `baterias`, `som` —, servindo o que está imobilizado no estoque. Linha fora do escopo vem `null`.

| Rota | Conteúdo de cada face | Requer `ver_custo` |
|---|---|---|
| `/custo` | `{ valor, itens, produtos }` — Σ (custo × saldo) | **Sim** (`403` sem ela) |
| `/venda` | `{ valor, itens, produtos }` — Σ (preço × saldo) | Não |
| `/criticos` | `{ quantidade, itens[] }` — saldo ≤ mínimo | Não |

O gate assimétrico é deliberado: **preço de venda e quantidade em estoque não são dados sensíveis.** O preço já sai em `/api/estoque` para qualquer usuário e está na Tabela de Preços; o saldo aparece na tela de estoque. Pendurá-los atrás de `ver_custo` esconderia de um vendedor números que ele já vê item a item.

### Preço usado em `/venda`

```javascript
const precoVendaDe = (p) => Number(p?.valor_parcelado ?? p?.valor_venda ?? 0);
```

O parcelado é o preço de vitrine. O fallback para `valor_venda` cobre produto legado sem parcelado — sem ele, um cadastro futuro sem preço entraria como R$ 0 e sumiria do total em silêncio.

**Mão de obra de classe não entra.** O indicador mede o que a prateleira vale; serviço não está em estoque.

### Produtos críticos

O corte é `saldo <= qtd_minima` — produto **exatamente** no mínimo já é crítico, porque é o momento de repor, não o momento seguinte.

```json
{
  "data": {
    "total": {
      "quantidade": 41,
      "itens": [
        { "id": 12, "linha": "baterias", "produto": "Bateria 60Ah", "modelo": "BAT-60", "em_estoque": 1, "qtd_minima": 4 }
      ]
    },
    "baterias": { "quantidade": 28, "itens": ["..."] },
    "som":      { "quantidade": 13, "itens": ["..."] }
  }
}
```

Cada item carrega `linha`, então `total.itens` é auto-descritivo e a interface agrupa sem precisar saber a origem.

Dois pontos de implementação:

- **O filtro é em memória.** O Prisma 5 não compara duas colunas no `where` (`em_estoque <= qtd_minima`). Com algumas centenas de produtos, filtrar em JavaScript é honesto; a troca por `$queryRaw` só se justifica se a ordem de grandeza mudar.
- **Saldo negativo aparece como negativo.** Diferente das somas de imobilizado, que aplicam piso em zero para que um saldo negativo não *abata* o total, aqui o número negativo é a informação: sinaliza inconsistência para quem vai repor.

---

## Paginação e o campo `pageSizeSolicitado`

Oito rotas de listagem aplicam limite a `pageSize`. O limite sempre existiu; o que não existia era **sinal** de que ele havia atuado.

O helper [`backend/src/utils/paginacao.js`](../backend/src/utils/paginacao.js) centraliza o cálculo e o envelope:

```javascript
const { page, pageSize, pageSizeSolicitado, skip, take } =
  paginacao(req.query, { padrao: 10, teto: 100 });

res.json(envelope({ page, pageSize, pageSizeSolicitado, total, data }));
```

| Rota | Padrão | Teto |
|---|---|---|
| `/api/estoque`, `/api/estoque-som` | 10 | 100 |
| `/api/movimentacoes`, `/api/movimentacoes-som` | 10 | 100 |
| `/api/pedido-som` | 20 | 100 |
| `/api/garantias` | 50 | **200** |
| `/api/inventario/historico` | 20 | 100 |
| `/api/inventario/:linha/historico` | 10 | 100 |

O envelope devolve `pageSizeSolicitado` **sempre**, não apenas quando houve corte: um campo que aparece só na anomalia é fácil de esquecer de checar e difícil de testar por ausência. Detectar truncamento é uma comparação:

```javascript
if (resposta.pageSizeSolicitado > resposta.pageSize) {
  // a lista veio truncada
}
```

**O comportamento não mudou.** Pedir `pageSize=9999` continua devolvendo o teto, com status `200`. Recusar com `400` quebraria clientes que pedem alto de propósito contando com o limite.

### Consumindo a lista completa

Telas que precisam de todos os registros iteram as páginas, através de `todasAsPaginas()` em `frontend/src/services/apiFactories.js`. Pedir um número grande e torcer não funciona — foi assim que os indicadores da tela inicial passaram meses truncados.

---

## Componente de carrossel

Os indicadores que existem por linha usam um card que alterna entre faces — Total, Baterias e Som — por clique, deslize horizontal, teclado ou pelos marcadores. A mecânica vive em `CardCarrossel`, no arquivo da tela inicial, e recebe de fora a cor, o título e o corpo de cada face.

Duas regras de montagem das faces:

- Linha fora do escopo do usuário vem `null` da API e **não vira face**.
- Com **uma única linha visível**, o total seria idêntico a ela: o card mostra uma face só e os marcadores desaparecem.

As três faces chegam num único payload, de propósito: trocar de face não dispara requisição nova.
