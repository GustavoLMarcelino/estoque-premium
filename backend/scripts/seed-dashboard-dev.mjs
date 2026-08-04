/**
 * Seed de dados de TESTE para o dashboard Baterias/Som/Ambos — SÓ DESENVOLVIMENTO.
 *
 * Rodar:  npm run seed:dashboard        (de dentro de backend/)
 *
 * POR QUE EXISTE: o dashboard da Fase 2 tem faces e avisos que só aparecem com
 * dados variados (taxa por faixa de parcela, pedido só de serviço, saída sem
 * pedido). Criar isso na mão a cada clique-teste é lento e dá números errados.
 *
 * COMO CRIA: batendo nas ROTAS REAIS via supertest, com um JWT de admin do
 * próprio banco. Ou seja, passa pelo mesmo zod, pela mesma trava de margem,
 * pelo mesmo cálculo de total/mão de obra/comissão e pela mesma baixa de
 * estoque que a loja usa. Nada de INSERT cru na criação — o dashboard reflete
 * exatamente o que produção mostraria com esses lançamentos.
 * (A LIMPEZA usa delete direto: desfazer não é o que está sendo testado, e as
 * linhas apagadas são só as que este script criou.)
 *
 * NUNCA roda contra produção: ver a trava em exigirBancoLocal().
 */
import 'dotenv/config';
import jwt from 'jsonwebtoken';
import request from 'supertest';

// Marcador de tudo que este script cria. A limpeza apaga SÓ o que casa com ele,
// então o banco de dev do lojista (produtos e vendas reais) fica intacto.
const SEED = 'SEED-';

/* ------------------------------------------------------------------ *
 * TRAVA DE SEGURANÇA — precisa passar ANTES de qualquer import que    *
 * abra conexão com o banco (por isso roda no topo, não dentro do run) *
 * ------------------------------------------------------------------ */
function exigirBancoLocal() {
  const url = process.env.DATABASE_URL || '';

  // 1) NODE_ENV de produção mata na hora, mesmo que a URL pareça inofensiva.
  if (process.env.NODE_ENV === 'production') {
    abortar('NODE_ENV=production. Este script é exclusivo de desenvolvimento.');
  }

  // 2) ALLOWLIST (não blocklist): a URL tem que SER SQLite local. Qualquer
  //    coisa que não comece com file: morre — inclusive um driver novo que
  //    ninguém previu. Blocklist de "mysql://" deixaria passar o que faltasse.
  if (!url.startsWith('file:')) {
    abortar(
      `DATABASE_URL não é um SQLite local (esperado começar com "file:").\n` +
      `   Recebido: ${mascarar(url)}\n` +
      `   Este script só roda no dev.db. Para produção NÃO existe caminho: é seed de teste.`,
    );
  }

  // 3) Cinto e suspensório: mesmo com file:, recusa qualquer sinal de banco
  //    remoto embutido na string (ex.: file: colado num proxy).
  const proibido = ['mysql', 'postgres', 'rds.amazonaws.com', '@'];
  const hit = proibido.find((p) => url.toLowerCase().includes(p));
  if (hit) {
    abortar(`DATABASE_URL contém "${hit}", sinal de banco remoto. Abortado por segurança.`);
  }

  console.log(`✓ Trava OK — banco local: ${url}`);
}

function mascarar(url) {
  return url.replace(/\/\/[^@]*@/, '//***:***@'); // some com usuário:senha no log
}

function abortar(msg) {
  console.error(`\n✗ SEED ABORTADO\n   ${msg}\n`);
  process.exit(1);
}

exigirBancoLocal();

// Só depois da trava: estes imports instanciam o PrismaClient.
const { prisma } = await import('../src/config/prisma.js');
const { app } = await import('../src/app.js');

/* ------------------------------------------------------------------ */

let auth;

/** Dispara na rota real e explode com contexto se a rota recusar — assim um
 *  seed inválido (margem, estoque insuficiente) aparece na hora, em vez de
 *  gerar um dashboard silenciosamente incompleto. */
async function post(rota, body) {
  const res = await request(app).post(rota).set(auth).send(body);
  if (res.status >= 300) {
    throw new Error(`POST ${rota} → ${res.status}: ${res.body?.message || JSON.stringify(res.body)}`);
  }
  return res.body;
}

/** Apaga só o que este script criou, em ordem segura de FK. Rodar o seed duas
 *  vezes seguidas dá exatamente o mesmo estado final (idempotente). */
async function limpar() {
  const baterias = await prisma.estoque.findMany({
    where: { produto: { startsWith: SEED } }, select: { id: true },
  });
  const som = await prisma.estoque_som.findMany({
    where: { produto: { startsWith: SEED } }, select: { id: true },
  });
  const idsBaterias = baterias.map((p) => p.id);
  const idsSom = som.map((p) => p.id);

  // pedido_som_item cai por cascade (onDelete: Cascade no schema).
  const pedidos = await prisma.pedido_som.deleteMany({ where: { veiculo: { startsWith: SEED } } });
  const movs = idsBaterias.length
    ? await prisma.movimentacoes.deleteMany({ where: { produto_id: { in: idsBaterias } } })
    : { count: 0 };
  const movsSom = idsSom.length
    ? await prisma.movimentacoes_som.deleteMany({ where: { produto_id: { in: idsSom } } })
    : { count: 0 };
  await prisma.estoque.deleteMany({ where: { id: { in: idsBaterias } } });
  await prisma.estoque_som.deleteMany({ where: { id: { in: idsSom } } });

  const total = pedidos.count + movs.count + movsSom.count + idsBaterias.length + idsSom.length;
  console.log(
    total === 0
      ? '· Nada de seed anterior para limpar.'
      : `· Limpeza: ${idsBaterias.length} produto(s) baterias, ${idsSom.length} som, ` +
        `${movs.count} mov, ${movsSom.count} mov som, ${pedidos.count} pedido(s).`,
  );
}

async function run() {
  // Admin real do banco: requireAuth resolve o usuário pelo id do token, então
  // o JWT precisa apontar para uma linha que existe.
  const admin = await prisma.user.findFirst({ where: { role: 'admin' }, orderBy: { id: 'asc' } });
  if (!admin) abortar('Nenhum usuário admin no banco local. Rode `npm run seed` antes.');
  if (!process.env.JWT_SECRET) abortar('JWT_SECRET ausente no .env.');
  auth = {
    Authorization: `Bearer ${jwt.sign(
      { id: admin.id, email: admin.email, role: 'admin' },
      process.env.JWT_SECRET,
      { algorithm: 'HS256', expiresIn: '1h' },
    )}`,
  };
  console.log(`· Autenticado como admin do banco: ${admin.email}`);

  await limpar();

  // Marca e classes reais do banco (o seed não inventa catálogo).
  const marca = await prisma.marca.findFirst({ orderBy: { id: 'asc' } });
  if (!marca) abortar('Nenhuma marca no banco local. Rode `npm run seed` antes.');

  const classes = await prisma.classe_som.findMany();
  const acharClasse = (frag) =>
    classes.find((c) => c.nome.toLowerCase().includes(frag)) || null;
  // Classe só é usada em item de SERVIÇO: o cadastro de produto de Som não tem
  // mais classe_id (ver comentário em estoqueSom.routes.js) — mão de obra hoje
  // vem só de item MAO_OBRA, nunca "grudada" no produto.
  const classeInsulfilme = acharClasse('insulfilme'); // categoria INSULFILME (comissão própria)
  const classeAlarme = acharClasse('alarme');         // categoria SOM
  if (!classeInsulfilme || !classeAlarme) {
    abortar('Faltam classes de som (insulfilme/alarme) no banco. Rode `npm run seed`.');
  }

  /* ---------------- BATERIAS ---------------- */
  // Preços folgados acima do mínimo de margem (10% líquido pós-taxa), senão a
  // trava do próprio backend recusaria o cadastro.
  const bat = {};
  for (const [chave, produto, custo, vista, parcelado] of [
    ['p60',  `${SEED}Bateria 60Ah`,  250, 500,  600],
    ['p90',  `${SEED}Bateria 90Ah`,  400, 800,  950],
    ['p150', `${SEED}Bateria 150Ah`, 700, 1400, 1650],
  ]) {
    bat[chave] = await post('/api/estoque', {
      produto, modelo: 'Teste', marca_id: marca.id,
      custo, valor_venda: vista, valor_vista: vista, valor_parcelado: parcelado,
      qtd_minima: 2, qtd_inicial: 20, garantia: '12',
    });
  }
  console.log('· Baterias: 3 produtos criados.');

  // Uma venda por forma de pagamento — é o que faz a taxa variar por faixa
  // (1x, 2–6x, 7–10x) e alimenta o gráfico de composição.
  const vendasBat = [
    ['dinheiro', null, bat.p60.id,  1, 500],
    ['pix',      null, bat.p60.id,  2, 500],
    ['debito',   null, bat.p90.id,  1, 800],
    ['credito',  2,    bat.p90.id,  1, 950],
    ['credito',  10,   bat.p150.id, 1, 1650],
  ];
  for (const [forma, parcelas, produto_id, quantidade, valor_final] of vendasBat) {
    await post('/api/movimentacoes', {
      produto_id, tipo: 'saida', quantidade, valor_final,
      forma_pagamento: forma, ...(parcelas ? { parcelas } : {}),
      vendedor: 'Seed',
    });
  }
  console.log(`· Baterias: ${vendasBat.length} vendas (dinheiro, pix, débito, crédito 2x, crédito 10x).`);

  /* ---------------- SOM ---------------- */
  const som = {};
  for (const [chave, produto, custo, vista, parcelado] of [
    ['multimidia', `${SEED}Som Multimidia`,   400, 800, 950],
    ['alarme',     `${SEED}Som Alarme`,       150, 300, 360],
    ['falante',    `${SEED}Som Alto-falante`, 100, 200, 240],
  ]) {
    som[chave] = await post('/api/estoque-som', {
      produto, modelo: 'Teste', marca_id: marca.id,
      custo, valor_venda: vista, valor_vista: vista, valor_parcelado: parcelado,
      qtd_minima: 2, qtd_inicial: 20, garantia: '12',
    });
  }
  console.log('· Som: 3 produtos criados.');

  // Cada pedido cobre um caso que o dashboard precisa distinguir.
  const pedidos = [
    // Só produto, sem classe → nenhuma mão de obra. Crédito 2x (faixa 2–6).
    { veiculo: `${SEED}Gol - so produto`, forma_pagamento: 'Crédito 2x', parcelas: 2,
      itens: [{ tipo: 'PRODUTO', produto_id: som.falante.id, quantidade: 1, valor_unit: 240 }] },

    // Só serviço: qtdVendas +0, Atendimentos +1. Crédito 10x (faixa 7–10).
    { veiculo: `${SEED}Onix - so insulfilme`, forma_pagamento: 'Crédito 10x', parcelas: 10,
      itens: [{ tipo: 'MAO_OBRA', classe_id: classeInsulfilme.id, quantidade: 1 }] },

    // Misto — cobre os TRÊS caminhos de item numa tacada: produto, serviço por
    // classe (categoria SOM) e serviço manual sem classe.
    { veiculo: `${SEED}HB20 - misto`, forma_pagamento: 'PIX',
      itens: [
        { tipo: 'PRODUTO', produto_id: som.multimidia.id, quantidade: 1, valor_unit: 950 },
        { tipo: 'MAO_OBRA', classe_id: classeAlarme.id, quantidade: 1 },
        { tipo: 'MAO_OBRA', descricao: 'Instalacao extra', quantidade: 1, valor_unit: 200 },
      ] },

    // Dinheiro (taxa 0, mas COM forma informada — não pode cair no aviso).
    { veiculo: `${SEED}Strada - dinheiro`, forma_pagamento: 'Dinheiro',
      itens: [{ tipo: 'PRODUTO', produto_id: som.alarme.id, quantidade: 2, valor_unit: 360 }] },

    // SEM forma de pagamento → exercita o aviso âmbar "sem forma".
    { veiculo: `${SEED}Uno - sem forma`,
      itens: [{ tipo: 'PRODUTO', produto_id: som.falante.id, quantidade: 1, valor_unit: 240 }] },
  ];
  for (const p of pedidos) await post('/api/pedido-som', p);
  console.log(`· Som: ${pedidos.length} pedidos (só produto, só serviço, misto, dinheiro, sem forma).`);

  // Saída avulsa de estoque (modal do Estoque, não pedido): motivo fica null,
  // que é exatamente o que o backend conta em saidasSemPedido.
  await post('/api/movimentacoes-som', {
    produto_id: som.falante.id, tipo: 'saida', quantidade: 2,
  });
  console.log('· Som: 1 saída manual sem pedido (2 unidades).');

  /* ---------------- CONFERÊNCIA ---------------- */
  // Lê o MESMO endpoint que o dashboard consome e imprime as três faces, para
  // conferir a tela contra números que vieram do servidor, não da minha conta.
  const { body } = await request(app).get('/api/vendas-resumo').set(auth);
  const d = body?.data || {};
  const brl = (v) => `R$ ${Number(v || 0).toFixed(2)}`;
  const face = (nome, b) => {
    if (!b) return console.log(`\n── ${nome}: (fora do escopo)`);
    console.log(`\n── ${nome}`);
    console.log(`   Receita Bruta ....... ${brl(b.vendasBrutas)}`);
    console.log(`   Custo dos vendidos .. ${brl(b.custoVendido)}`);
    console.log(`   Taxas ............... ${brl(b.taxas)}`);
    console.log(`   Lucro Bruto ......... ${brl(b.lucroBruto)}`);
    console.log(`   Lucro Líquido ....... ${brl(b.lucroLiquido)}`);
    console.log(`   Qtd Vendida ......... ${b.qtdVendas}`);
    if (b.qtdPedidos !== undefined) {
      console.log(`   Atendimentos ........ ${b.qtdPedidos}`);
      console.log(`   Receita Produtos .... ${brl(b.receitaProdutos)}`);
      console.log(`   Receita Mão de Obra . ${brl(b.receitaMaoObra)}`);
      console.log(`   Saídas sem pedido ... ${b.saidasSemPedido?.movimentacoes} mov / ${b.saidasSemPedido?.unidades} un`);
    }
    console.log(`   Sem forma ........... ${b.vendasSemForma?.qtd} venda(s) · ${brl(b.vendasSemForma?.receita)}`);
  };

  console.log('\n═══ O QUE O DASHBOARD DEVE MOSTRAR ═══');
  console.log('(inclui os dados que já existiam no dev.db, não só os do seed)');
  face('BATERIAS', d.baterias);
  face('SOM', d.som);
  face('AMBOS (total)', d.total);
  console.log('');
}

run()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error('\n✗ SEED FALHOU:', e.message);
    await prisma.$disconnect();
    process.exit(1);
  });
