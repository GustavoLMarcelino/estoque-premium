# Edição de vendas

Este documento descreve como o sistema permite corrigir uma venda já lançada sem excluí-la e refazê-la. Cobre as garantias que sustentam essa operação — estorno seguro, auditoria, ordem das validações — e as regras que impedem que uma correção altere silenciosamente preço, data ou comissão. Serve para quem vai mexer em qualquer rota de escrita de venda.

Pressupõe os conceitos de [ARQUITETURA.md](ARQUITETURA.md): linha de produto, estoque como agregado, quinzena de comissão e snapshots congelados.

---

## Índice

- [O problema](#o-problema)
- [As fases](#as-fases)
- [Estorno seguro](#estorno-seguro)
- [Auditoria](#auditoria)
- [Estorna e reaplica](#estorna-e-reaplica)
- [A ordem das validações](#a-ordem-das-validações)
- [Preço nunca é recalculado](#preço-nunca-é-recalculado)
- [O que nunca se edita](#o-que-nunca-se-edita)
- [Trocar o vendedor](#trocar-o-vendedor)
- [Quinzena fechada](#quinzena-fechada)
- [Conferência de inventário aberta](#conferência-de-inventário-aberta)
- [Referência dos endpoints](#referência-dos-endpoints)
- [O que ainda não existe](#o-que-ainda-não-existe)

---

## O problema

Até a introdução das rotas de edição, uma venda lançada com produto ou quantidade errados só tinha uma saída: excluir e lançar de novo. Isso trocava um erro por outro conjunto de efeitos — a venda perdia o `id` original, a data de lançamento virava a data da correção (reclassificando a quinzena da comissão e o período do dashboard) e, no caso de Som, o pedido inteiro precisava ser remontado item a item.

A edição existe para que corrigir um campo custe exatamente a alteração daquele campo.

---

## As fases

O ciclo foi construído em etapas, cada uma dependendo da anterior. A nomenclatura A–D aparece em comentários do código e em mensagens de commit.

| Fase | Escopo | Efeito em estoque |
|---|---|---|
| **A** | Exclusão segura de venda | Estorna |
| **B** | Diário de auditoria | Nenhum |
| **C** | Pedido de Som — cabeçalho (veículo, forma de pagamento, parcelas) | Nenhum |
| **C2** | Pedido de Som — serviços e mão de obra | Nenhum |
| **D** | Pedido de Som — produtos e quantidades | **Sim** |
| **D (Baterias)** | Venda de Baterias — produto, quantidade, valor, vendedor, forma | **Sim** |

As fases C, C2 e D de Som convivem num **único** `PUT /api/pedido-som/:id`, deliberadamente: uma transação, uma linha de auditoria e uma reagregação no fim. Separá-las em rotas distintas permitiria um pedido meio-editado, com o estoque já alterado e os totais ainda antigos.

---

## Estorno seguro

Desfazer a baixa de estoque de uma venda é a operação de base de todo o ciclo. Ela vive em [`backend/src/utils/estorno.js`](../backend/src/utils/estorno.js) e é compartilhada pelos três caminhos destrutivos (venda de Baterias, movimentação avulsa de Som, pedido de Som).

```javascript
export function dadosEstorno({ tipo, quantidade, produto, rotulo }) {
  const campo = tipo === 'ENTRADA' ? 'entradas' : 'saidas';
  const acumulado = Number(produto?.[campo] ?? 0);

  if (quantidade > acumulado) {
    throw Object.assign(new Error(/* mensagem com o rótulo do produto */), { statusCode: 409 });
  }
  return { [campo]: { decrement: quantidade } };
}
```

Duas propriedades importam:

**Falha em vez de truncar.** A implementação anterior fazia `Math.max(0, acumulado − quantidade)`. Quando o estorno levaria o acumulador a negativo — sinal de que os dados já estavam inconsistentes —, ela truncava em zero, gravava um estoque errado e respondia `204`. Agora lança `409`, a transação sofre rollback e nada é alterado. Estado inconsistente vira erro visível.

**`decrement` atômico.** Ver [ARQUITETURA.md](ARQUITETURA.md#escrita-atômica).

---

## Auditoria

Toda edição e toda exclusão de venda gravam uma linha em `venda_auditoria` **antes** de qualquer escrita destrutiva, dentro da mesma transação. O formato e as decisões de desenho estão em [ARQUITETURA.md](ARQUITETURA.md#auditoria-de-vendas).

O ponto relevante aqui é a ordem: o diário é escrito primeiro, mas só sobrevive se a operação completar.

```javascript
await registrarAuditoria(tx, { /* snapshot do estado ANTERIOR */ });
const estorno = dadosEstorno({ /* ... */ });   // pode lançar 409
if (estorno) await tx.estoque.update({ /* ... */ });
```

Se o estorno reprovar, o `throw` derruba a transação e a linha de auditoria desaparece junto. O snapshot inclui também dados do produto (`id`, `produto`, `modelo`), porque o produto pode ser excluído depois e o registro viraria um `produto_id` sem nome.

---

## Estorna e reaplica

Ao editar produto ou quantidade, o sistema **estorna toda a baixa anterior e aplica a nova**, em vez de calcular um delta.

Para o **pedido de Som** isso não é uma escolha de estilo, é a única implementação correta. Como descrito em [ARQUITETURA.md](ARQUITETURA.md#as-duas-linhas-de-produto), `movimentacoes_som` se liga ao pedido apenas por `motivo = 'Pedido Som #<id>'`, sem vínculo com o item. Dois itens do mesmo produto no mesmo pedido geram movimentações **indistinguíveis** — "desfazer a movimentação daquele item" não existe no banco.

Para a **venda de Baterias** o problema nem chega a se colocar: a venda é uma linha só, sem itens filhos. A movimentação editada *é* o registro de estoque, não uma sombra dele. Por isso a edição de Baterias é substancialmente mais simples: não há `deleteMany` de filhos, não há reagregação de totais, e o timeout padrão de transação (5 s) é suficiente.

### Reagregação (apenas Som)

O cabeçalho de `pedido_som` guarda quatro valores **derivados** dos itens: `valor_total`, `valor_mao_obra`, `valor_mao_obra_insulfilme` e `comissao_joel`. Depois de qualquer mudança em itens, `reagregarPedido()` os recalcula a partir do que está no banco, usando a mesma fórmula do `POST`.

Duas regras dentro dessa função merecem atenção:

- **A categoria é re-derivada** da classe a cada execução, e isso é seguro porque `classe_som.categoria` é imutável após a criação (o `PATCH` de classes aceita apenas `nome`, `valor_mao_obra` e `ativo`).
- **O valor da mão de obra jamais é relido da classe.** Ele vem de `item.mao_obra_total`, congelado no item. Reler reprecificaria em silêncio todo pedido antigo assim que alguém corrigisse a tabela de classes.

---

## A ordem das validações

**O estorno vem antes da validação de estoque.** Essa é a regra mais fácil de implementar errado e a que mais testes protegem.

Considere um produto com `em_estoque = 0`, onde as únicas duas unidades vendidas pertencem à venda que está sendo editada. Aumentar a venda de 2 para 3 unidades é uma operação **válida** — as 2 unidades voltam ao estoque antes da nova baixa:

```text
em_estoque = 0
  ├─ estorno da venda atual (2 un.)  → em_estoque = 2
  ├─ validação: 3 > 2 ?              → 409, corretamente
  └─ validação: 2 > 2 ?              → passa, corretamente
```

Validar antes do estorno recusaria as duas com `409`, indevidamente. Quando o produto não muda, a releitura após o estorno traz a linha já atualizada; quando muda, o estorno acontece no produto antigo e a validação no novo.

Uma mutação de teste que inverte essa ordem quebra **8 dos 33 casos** da suíte de edição de Baterias.

---

## Preço nunca é recalculado

O backend **não** consulta o preço atual do catálogo ao editar. O valor unitário é obrigatório no payload sempre que produto ou quantidade mudam:

```javascript
if ((trocouProduto || mudouQuantidade) && !mexe('valor_final')) {
  throw Object.assign(
    new Error('Informe o valor unitário ao mudar o produto ou a quantidade — o preço da venda não é recalculado pela tabela atual.'),
    { statusCode: 400 },
  );
}
```

O motivo: mudar a quantidade de uma venda de julho não pode reprecificá-la pela tabela de hoje. A venda registra **o que foi cobrado**, não o que o catálogo diz agora. A mesma regra vale para a mão de obra de Som, onde o valor gravado no item viaja junto no payload de edição, para que um item não tocado nunca seja reprecificado.

Quando a tela precisa sugerir um preço — ao adicionar um produto novo a um pedido, por exemplo —, ela lê o catálogo **no cliente** e envia o valor explicitamente. A decisão de qual preço cobrar é da tela; o backend apenas grava o que recebe.

---

## O que nunca se edita

Os schemas de edição usam `.strict()` do Zod. Qualquer chave fora do contrato produz `400` nomeando o campo, em vez de ser descartada em silêncio.

| Campo bloqueado | Por quê |
|---|---|
| `data_movimentacao` / `created_at` | Define a quinzena da comissão **e** o período do dashboard. Editá-la reclassificaria uma venda possivelmente já paga |
| `tipo` | Uma venda não vira compra |
| `garantia_id`, `motivo` | O vínculo com empréstimo ou pedido não se digita |
| `user_id`, `created_by` | Quem lançou é histórico |
| `valor_total`, `valor_mao_obra`, `comissao_joel` (Som) | Derivados dos itens. Derivado não se edita, se recalcula |

Sem `.strict()`, enviar `created_at` retornaria `200` com a chave descartada, e o usuário concluiria que a alteração funcionou.

### Operações recusadas

| Situação | Status | Motivo |
|---|---|---|
| Movimentação com `garantia_id` preenchido | `409` | Empréstimo não é venda. A garantia continua apontando para aquela linha |
| Movimentação de Baterias com `tipo = 'ENTRADA'` | `409` | Ver [O que ainda não existe](#o-que-ainda-não-existe) |
| Usuário não-admin | `403` | Toda edição de venda é restrita a `admin` |

---

## Trocar o vendedor

A edição de venda de Baterias permite alterar o vendedor. Essa é a única operação do sistema que **move dinheiro entre pessoas** — todas as demais alteram *quanto* alguém recebe, não *quem* recebe.

Duas proteções específicas:

**Enum no schema de edição.** Como a apuração casa o nome por igualdade exata (ver [ARQUITETURA.md](ARQUITETURA.md#modelo-1--baterias-valor-fixo-por-unidade)), o campo é validado contra a lista de vendedores elegíveis:

```javascript
vendedor: z.enum(VENDEDORES_BATERIA).nullish(),
```

A criação de venda (`POST`) segue aceitando texto livre — é o comportamento histórico e há dados antigos —, mas um campo que a interface agora deixa **editar** não pode carregar essa armadilha.

**A interface não oferece opção vazia** quando a venda já tem vendedor. Esvaziar o campo removeria a venda da comissão; isso não é edição, é outra operação, e não está implementada.

---

## Quinzena fechada

Editar uma venda cuja quinzena de comissão já foi apurada e paga é **permitido**, gera **aviso** e **não recalcula** o snapshot. A decisão é deliberada: recalcular reescreveria o valor de um pagamento já efetuado.

As rotas de leitura marcam os registros com um booleano `periodo_fechado`, calculado pela mesma função de quinzena que a apuração usa:

```javascript
export function marcarPeriodoFechado(registro, fechados, campoData = 'created_at') {
  if (!registro || fechados == null || !registro[campoData]) return registro;
  const { inicio } = periodoDe(new Date(registro[campoData]));
  return { ...registro, periodo_fechado: fechados.has(inicio.getTime()) };
}
```

O parâmetro `campoData` é explícito porque as duas linhas apuram por campos diferentes — Som por `created_at` do pedido, Baterias por `data_movimentacao`. Passar o campo errado classificaria a venda na quinzena errada. O marcador só é calculado para `admin`, já que saber que um período foi apurado é informação de comissão.

O aviso na interface **nomeia quem recebeu**:

> A comissão desta venda já foi apurada e paga a *(vendedor)*, e continuará paga a *(vendedor)*. Passar a venda para *(outro vendedor)* não recalcula o período fechado — vale só daqui em diante.

> **Divergência acumulada.** Cada edição retroativa cria uma diferença permanente entre o snapshot pago e o estado atual da venda. O sistema **não** possui hoje um relatório que exponha essas divergências; detectá-las exigiria cruzar `venda_auditoria` com `comissao_periodo.fechado_at`. Ver [O que ainda não existe](#o-que-ainda-não-existe).

---

## Conferência de inventário aberta

Alterar produto ou quantidade enquanto há conferência `EM_ANDAMENTO` na linha faz o saldo do sistema mudar no meio da contagem, e a divergência registrada passa a culpar quem contou. As telas de edição consultam a conferência ativa e exigem confirmação explícita:

> Há uma conferência de estoque em andamento. Alterar produto ou quantidade agora muda o saldo do sistema no meio da contagem e vai gerar divergência. Continuar?

O sistema **avisa e permite**; não bloqueia.

---

## Referência dos endpoints

### `PUT /api/pedido-som/:id`

Edita um pedido de instalação. Todas as chaves são opcionais — ausente significa "não mexe".

```json
{
  "veiculo": "Gol 2018",
  "forma_pagamento": "Crédito 10x",
  "parcelas": 10,
  "itens_servico":     [{ "classe_id": 3, "quantidade": 1, "mao_obra_unit": 150.00 }],
  "mao_obra_produtos": [{ "item_id": 87, "mao_obra_unit": 80.00 }],
  "itens_produto":     [{ "item_id": 88, "produto_id": 12, "quantidade": 2, "valor_unit": 349.90 }]
}
```

| Chave | Efeito |
|---|---|
| `itens_servico` | Lista **desejada** de serviços. `[]` remove todos |
| `mao_obra_produtos` | Ajusta só o valor de mão de obra de itens de produto legados |
| `itens_produto` | Lista **desejada** de produtos. **Única chave que move estoque.** Máximo de 50 itens; `valor_unit` obrigatório |

O teto de 50 itens protege a transação: estorno e reaplicação fazem várias idas ao banco por item, e uma lista sem limite poderia estourar o tempo **depois** de já ter mexido em estoque. Esta rota — e apenas ela — usa `{ timeout: 15000, maxWait: 5000 }`; 50 itens executam em cerca de 146 ms.

### `PUT /api/movimentacoes/:id`

Edita uma venda de Baterias. Aceita seis chaves, todas opcionais:

```json
{
  "produto_id": 12,
  "quantidade": 3,
  "valor_final": 349.90,
  "vendedor": "Ismael",
  "forma_pagamento": "credito",
  "parcelas": 10
}
```

`valor_final` é **unitário**, como em toda a base — o dashboard multiplica por quantidade.

O algoritmo, em transação:

1. Carrega a movimentação (`404` se não existe).
2. Recusa `garantia_id` preenchido (`409`) e `tipo ≠ SAIDA` (`409`).
3. Exige `valor_final` se produto ou quantidade mudam (`400`).
4. Grava a auditoria com o snapshot anterior.
5. **Estorna** a baixa antiga (`409` + rollback se não couber).
6. Relê o produto de destino e **valida sobre o saldo já estornado** (`409` se insuficiente).
7. Aplica a nova baixa com `{ increment }`.
8. Atualiza o cabeçalho, normalizando `parcelas` para `null` fora do crédito.

Sem timeout customizado: três leituras e três escritas de tamanho fixo, que não crescem com nada.

---

## O que ainda não existe

| Lacuna | Situação |
|---|---|
| **Editar `ENTRADA` de Baterias** | Recusado com `409`. A criação de entrada pode reescrever custo e preços **do produto**, e o diário guarda a movimentação, não o custo anterior do produto — a edição seria irreversível pelo log. Corrigir entrada continua sendo excluir e relançar |
| **Editar movimentação avulsa de Som** | Não há `PUT` em `/api/movimentacoes-som`. Só criação e exclusão |
| **Relatório de divergência** | Nada expõe as diferenças entre snapshots congelados e o estado atual após edições retroativas. Os dados existem (`venda_auditoria`, `comissao_periodo.fechado_at`, `conferencia_item`); o relatório, não |
| **Remover o vendedor de uma venda** | A interface não oferece a opção. Removeria a venda da comissão, o que é uma operação distinta de editar |
