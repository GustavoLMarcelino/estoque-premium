// Guard de deploy — o gate por COBERTURA que substituiu a detecção por range.
//
// Roda o SCRIPT DE VERDADE (execFile), com GUARD_RAIZ apontando para um
// diretório-fixture: nada aqui reimplementa a lógica do guard, então um bug no
// script quebra o teste. É infra crítica — testar uma cópia da lógica não valeria.
//
// O furo que motivou a mudança está no cenário B: um .sql não registrado, num
// push que NÃO o traz. A versão por range liberava; a por cobertura bloqueia.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { execFile, execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process'; // explícito: a config de ESLint dá globals de browser aos .js
import { fileURLToPath } from 'node:url';

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GUARD = path.join(backendDir, 'scripts', 'guard-sql-pendente.mjs');

const criados = [];
let raiz;

/** Roda o guard na fixture. Resolve sempre (não rejeita) para inspecionar o code. */
function rodarGuard(env = {}) {
  return new Promise((resolve) => {
    execFile(
      process.execPath,
      [GUARD],
      { env: { ...process.env, GUARD_RAIZ: raiz, GITHUB_EVENT_NAME: 'push', GITHUB_OUTPUT: '', ...env } },
      (erro, stdout, stderr) => resolve({ code: erro ? erro.code : 0, stdout, stderr }),
    );
  });
}

const dirSql = () => path.join(raiz, 'backend', 'prisma', 'sql');
const dirManual = () => path.join(raiz, 'backend', 'prisma', 'manual');

const escreverSql = (nome, dir = dirSql()) =>
  writeFileSync(path.join(dir, nome), '-- ALTER TABLE x ADD COLUMN y INT NULL;\n');

/** Caminho relativo à raiz da fixture, a partir de nome puro ou caminho. */
const rel = (a) => (a.includes('/') ? a : `backend/prisma/sql/${a}`);

/** Hash do arquivo da fixture pela MESMA regra do guard: sha256 do conteúdo com
 *  CRLF normalizado. Calcular aqui (em vez de hardcodar) mantém os testes
 *  válidos quando o corpo do .sql da fixture mudar. */
function hashFixture(arquivo, tamanho = 12) {
  const conteudo = readFileSync(path.join(raiz, rel(arquivo)), 'utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(conteudo, 'utf8').digest('hex').slice(0, tamanho);
}

/**
 * Ledger com as linhas informadas.
 *
 *  - string             → linha crua (quando o formato da linha É o objeto do teste)
 *  - { arquivo, hash? } → hash omitido = calculado do arquivo real da fixture
 */
function escreverLedger(linhas) {
  const monta = (l) => (typeof l === 'string'
    ? l
    : `| ${l.arquivo} | \`${l.hash ?? hashFixture(l.arquivo)}\` | 01/01/2026 | Gustavo | — |`);

  const corpo = [
    '# SQL manual aplicado no RDS (produção)',
    '',
    'Texto de prosa que menciona um arquivo-armadilha: nao-registrado.sql',
    '',
    '## Aplicados',
    '',
    '| Arquivo | Hash | Data (aplicado no RDS) | Quem rodou | Observação |',
    '|---|---|---|---|---|',
    ...linhas.map(monta),
    '',
    '<!-- Exemplo em comentário, não vale como registro:',
    '| backend/prisma/sql/dentro-do-comentario.sql | `0123456789ab` | 01/01/2026 | X | — |',
    '-->',
    '',
  ].join('\n');
  writeFileSync(path.join(dirSql(), 'APLICADOS.md'), corpo);
}

beforeEach(() => {
  raiz = mkdtempSync(path.join(tmpdir(), 'guard-fixture-'));
  criados.push(raiz);
  mkdirSync(dirSql(), { recursive: true });
  mkdirSync(dirManual(), { recursive: true });
});

afterAll(() => {
  for (const d of criados) {
    try { rmSync(d, { recursive: true, force: true }); } catch { /* fixture já foi */ }
  }
});

/* ─────────────────────────── os 4 cenários ─────────────────────────── */

describe('Cenário A — .sql novo NÃO registrado → BLOQUEIA', () => {
  it('bloqueia e nomeia o arquivo pendente', async () => {
    escreverSql('2026-09-01-nova-coluna.sql');
    escreverLedger([]);

    const r = await rodarGuard();
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/SQL manual pendente/);
    expect(r.stderr).toMatch(/2026-09-01-nova-coluna\.sql/);
  });
});

describe('Cenário B — O FURO: .sql não registrado já no repo, push SEM .sql novo', () => {
  it('BLOQUEIA mesmo sem nada de SQL neste push (antes: liberava)', async () => {
    // Estado idêntico ao do M2: o .sql já está no repo de um push anterior, e
    // este push não encosta nele. A detecção por range não via nada — o gate
    // sumia e o deploy levava o HEAD com o código dependente.
    escreverSql('2026-09-01-nova-coluna.sql');
    escreverLedger([]);
    // Nenhum SHA de range: o guard nem chega a olhar diff, o gate é o estado.
    const r = await rodarGuard({ SHA_ANTES: '', SHA_DEPOIS: '' });

    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/SQL manual pendente/);
    expect(r.stderr).toMatch(/NÃO depende de este push ter trazido o \.sql/);
  });

  it('um .sql pendente trava mesmo com outros já registrados', async () => {
    escreverSql('2026-08-01-antigo.sql');
    escreverSql('2026-09-01-nova-coluna.sql');
    escreverLedger([{ arquivo: 'backend/prisma/sql/2026-08-01-antigo.sql' }]);

    const r = await rodarGuard();
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/2026-09-01-nova-coluna\.sql/);
    expect(r.stderr).not.toMatch(/• backend\/prisma\/sql\/2026-08-01-antigo\.sql/);
  });
});

describe('Cenário C — todos registrados → LIBERA', () => {
  it('libera com os dois diretórios cobertos', async () => {
    escreverSql('2026-08-01-um.sql');
    escreverSql('2026-08-02-dois.sql');
    escreverSql('20260709_manual.sql', dirManual());
    escreverLedger([
      { arquivo: 'backend/prisma/sql/2026-08-01-um.sql' },
      { arquivo: 'backend/prisma/sql/2026-08-02-dois.sql' },
      { arquivo: 'backend/prisma/manual/20260709_manual.sql' },
    ]);

    const r = await rodarGuard();
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Cobertura OK — os 3 \.sql/);
  });

  it('repositório sem nenhum .sql libera', async () => {
    escreverLedger([]);
    const r = await rodarGuard();
    expect(r.code).toBe(0);
  });
});

describe('Cenário D — registrar no ledger passa a LIBERAR', () => {
  it('mesmo arquivo: bloqueado antes, liberado depois da linha', async () => {
    escreverSql('2026-09-01-nova-coluna.sql');

    escreverLedger([]);
    expect((await rodarGuard()).code).toBe(1);

    escreverLedger([{ arquivo: 'backend/prisma/sql/2026-09-01-nova-coluna.sql' }]);
    const depois = await rodarGuard();
    expect(depois.code).toBe(0);
    expect(depois.stdout).toMatch(/Cobertura OK/);
  });
});

/* ─────────────────── robustez do parsing do ledger ─────────────────── */

describe('Parsing do APLICADOS.md', () => {
  it('aceita nome puro (sem caminho) na coluna Arquivo', async () => {
    escreverSql('2026-09-01-nova-coluna.sql');
    escreverLedger([{ arquivo: '2026-09-01-nova-coluna.sql' }]);
    expect((await rodarGuard()).code).toBe(0);
  });

  it('tolera espaços sobrando em volta das células', async () => {
    escreverSql('2026-09-01-nova-coluna.sql');
    const h = hashFixture('2026-09-01-nova-coluna.sql');
    escreverLedger([`|   backend/prisma/sql/2026-09-01-nova-coluna.sql   |   \`${h}\`   | 01/09/2026 | G | — |`]);
    expect((await rodarGuard()).code).toBe(0);
  });

  it('NÃO aceita registro em comentário HTML', async () => {
    escreverSql('dentro-do-comentario.sql'); // o exemplo comentado do ledger
    escreverLedger([]);
    const r = await rodarGuard();
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/dentro-do-comentario\.sql/);
  });

  it('NÃO aceita menção em prosa fora da tabela', async () => {
    // escreverLedger() escreve "nao-registrado.sql" no meio de um parágrafo.
    escreverSql('nao-registrado.sql');
    escreverLedger([]);
    expect((await rodarGuard()).code).toBe(1);
  });

  it('ignora cabeçalho, separador e a linha coletiva sem arquivo', async () => {
    escreverSql('2026-09-01-nova-coluna.sql');
    escreverLedger([
      '| _(anteriores ao guard)_ | — | Gustavo | linha coletiva, não registra nada |',
      { arquivo: 'backend/prisma/sql/2026-09-01-nova-coluna.sql' },
    ]);
    expect((await rodarGuard()).code).toBe(0);
  });

  it('ledger ausente → falha FECHADO', async () => {
    escreverSql('2026-09-01-nova-coluna.sql');
    // sem escreverLedger()
    const r = await rodarGuard();
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/ledger de SQL aplicado não encontrado/);
  });
});

/* ─────────────────── hash: o conteúdo entra na cobertura ─────────────────── */

// A cobertura por NOME não via editar um .sql já registrado: mesmo nome, DDL
// diferente, ledger dizendo "aplicado" sobre um arquivo que não existe mais.
// O hash fecha isso. O que ele NÃO fecha (escrever .sql e linha no mesmo commit
// sem rodar no RDS) é risco aceito e documentado — não há teste porque não há
// comportamento a testar: aquilo passa, de propósito.

describe('Hash do conteúdo', () => {
  it('hash correto → libera', async () => {
    escreverSql('2026-09-01-nova-coluna.sql');
    escreverLedger([{ arquivo: '2026-09-01-nova-coluna.sql' }]);

    const r = await rodarGuard();
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/conteúdo idêntico ao registrado/);
  });

  it('conteúdo editado depois do registro → BLOQUEIA com mensagem própria', async () => {
    escreverSql('2026-09-01-nova-coluna.sql');
    escreverLedger([{ arquivo: '2026-09-01-nova-coluna.sql' }]);
    const registrado = hashFixture('2026-09-01-nova-coluna.sql');

    // Mesmo nome, DDL diferente — o caso que passava batido antes do hash.
    writeFileSync(
      path.join(dirSql(), '2026-09-01-nova-coluna.sql'),
      '-- ALTER TABLE x ADD COLUMN OUTRA INT NULL;\n-- DROP TABLE importante;\n',
    );
    const noDisco = hashFixture('2026-09-01-nova-coluna.sql');
    expect(noDisco).not.toBe(registrado);

    const r = await rodarGuard();
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/alterado depois de registrado/);
    // Mensagem distinta da de "pendente": a ação corretiva é outra.
    expect(r.stderr).not.toMatch(/SQL manual pendente/);
    // Mostra os dois lados, senão não dá para saber o que aconteceu.
    expect(r.stderr).toContain(registrado);
    expect(r.stderr).toContain(noDisco);
    expect(r.stderr).toMatch(/NÃO RODOU NO RDS/);
  });

  it('célula de hash vazia → BLOQUEIA (motivo sem-hash)', async () => {
    escreverSql('2026-09-01-nova-coluna.sql');
    escreverLedger(['| backend/prisma/sql/2026-09-01-nova-coluna.sql |  | 01/09/2026 | Gustavo | — |']);

    const r = await rodarGuard();
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/sem a coluna Hash/);
  });

  it('linha no formato ANTIGO de 4 colunas → BLOQUEIA (a data cai na coluna do hash)', async () => {
    // Memória muscular de quem já escreveu o ledger antes do hash. A 2ª célula
    // vira '01/09/2026', que não é hex — acusar formato inválido aponta para a
    // coluna errada, que é exatamente o problema.
    escreverSql('2026-09-01-nova-coluna.sql');
    escreverLedger(['| backend/prisma/sql/2026-09-01-nova-coluna.sql | 01/09/2026 | Gustavo | — |']);

    const r = await rodarGuard();
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/formato inválido/);
  });

  it('hash em formato inválido → BLOQUEIA como inválido, não como ausente', async () => {
    escreverSql('2026-09-01-nova-coluna.sql');
    escreverLedger(['| backend/prisma/sql/2026-09-01-nova-coluna.sql | `xyz` | 01/09/2026 | G | — |']);

    const r = await rodarGuard();
    expect(r.code).toBe(1);
    // Erro de digitação não pode se disfarçar de "ainda não preenchi".
    expect(r.stderr).toMatch(/formato inválido/);
    expect(r.stderr).not.toMatch(/sem a coluna Hash/);
  });

  it('hash completo de 64 chars → libera (comparação é por prefixo)', async () => {
    escreverSql('2026-09-01-nova-coluna.sql');
    escreverLedger([{
      arquivo: '2026-09-01-nova-coluna.sql',
      hash: hashFixture('2026-09-01-nova-coluna.sql', 64),
    }]);

    expect((await rodarGuard()).code).toBe(0);
  });

  it('CRLF e LF no mesmo conteúdo dão o MESMO hash', async () => {
    // O teste mais importante deste bloco. Um clone no Windows
    // (core.autocrlf=true) materializa CRLF; o runner do GitHub, LF. Sem a
    // normalização o guard travaria todo deploy acusando divergência que não
    // existe — e ninguém descobriria em dev. Se alguém trocar a normalização
    // por sha256 de bytes crus, é aqui que quebra.
    const corpoLf = '-- ALTER TABLE x ADD COLUMN y INT NULL;\n-- segunda linha;\n';
    const arquivo = path.join(dirSql(), '2026-09-01-nova-coluna.sql');

    writeFileSync(arquivo, corpoLf);
    const hashLf = hashFixture('2026-09-01-nova-coluna.sql');
    escreverLedger([{ arquivo: '2026-09-01-nova-coluna.sql', hash: hashLf }]);
    expect((await rodarGuard()).code).toBe(0);

    // Mesmo conteúdo, finais de linha do Windows: o ledger NÃO muda.
    writeFileSync(arquivo, corpoLf.replace(/\n/g, '\r\n'));
    expect(hashFixture('2026-09-01-nova-coluna.sql')).toBe(hashLf);

    const comCrlf = await rodarGuard();
    expect(comCrlf.code).toBe(0);
    expect(comCrlf.stderr).not.toMatch(/alterado depois de registrado/);
  });
});

/* ─────────────────── prefixo de ignorados (não é DDL de produção) ─────────────────── */

describe('Prefixo "_" — .sql que o guard não cobra', () => {
  it('arquivo com prefixo não precisa de linha no ledger', async () => {
    escreverSql('_rollback-emergencia.sql');
    escreverLedger([]);

    const r = await rodarGuard();
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Cobertura OK — os 0 \.sql/);
  });

  it('a exclusão NUNCA é silenciosa: o guard lista os ignorados', async () => {
    escreverSql('_consulta-diagnostico.sql');
    escreverSql('2026-09-01-nova-coluna.sql');
    escreverLedger([{ arquivo: '2026-09-01-nova-coluna.sql' }]);

    const r = await rodarGuard();
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/1 \.sql ignorado/);
    expect(r.stdout).toMatch(/_consulta-diagnostico\.sql/);
  });

  it('ignorado não vale como nome no sql_aplicado do dispatch', async () => {
    // Ele não roda no RDS: não há o que liberar com o nome dele.
    escreverSql('_rollback.sql');
    escreverSql('2026-09-01-nova-coluna.sql');
    escreverLedger([]);

    const r = await rodarGuard({ GITHUB_EVENT_NAME: 'workflow_dispatch', SQL_APLICADO: '_rollback.sql' });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/nome de SQL inválido/);
  });
});

/* ─────────────────── escopo: migrations do Prisma ─────────────────── */

describe('Escopo — migrations do Prisma ficam de fora', () => {
  it('.sql em prisma/migrations/ não conta (é do SQLite de dev)', async () => {
    const mig = path.join(raiz, 'backend', 'prisma', 'migrations', '20260901_x');
    mkdirSync(mig, { recursive: true });
    writeFileSync(path.join(mig, 'migration.sql'), 'ALTER TABLE "x" ADD COLUMN "y" INTEGER;\n');
    escreverLedger([]);

    const r = await rodarGuard();
    expect(r.code).toBe(0); // não bloqueia: migration não toca o RDS
  });
});

/* ─────────────────── liberação manual (workflow_dispatch) ─────────────────── */

describe('workflow_dispatch — liberação pontual', () => {
  const dispatch = (sql) => ({ GITHUB_EVENT_NAME: 'workflow_dispatch', SQL_APLICADO: sql });

  it('nome real do .sql pendente libera aquele run', async () => {
    escreverSql('2026-09-01-nova-coluna.sql');
    escreverLedger([]);

    const r = await rodarGuard(dispatch('2026-09-01-nova-coluna.sql'));
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Liberação manual aceita/);
    // Avisa que o ledger ainda precisa da linha, senão o próximo push trava.
    expect(r.stdout).toMatch(/Registre em .*APLICADOS\.md/);
  });

  it('valor genérico NÃO libera (anti-reflexo)', async () => {
    escreverSql('2026-09-01-nova-coluna.sql');
    escreverLedger([]);

    const r = await rodarGuard(dispatch('ok'));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/nome de SQL inválido/);
  });

  it('libera SÓ o arquivo informado — outro pendente continua travando', async () => {
    escreverSql('2026-09-01-um.sql');
    escreverSql('2026-09-02-dois.sql');
    escreverLedger([]);

    const r = await rodarGuard(dispatch('2026-09-01-um.sql'));
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/2026-09-02-dois\.sql/);
  });

  it('cobre por NOME mesmo com hash divergente (regra consciente)', async () => {
    // O dispatch é a confirmação humana. Exigir 12 hex digitados na UI do
    // Actions treinaria a colar sem ler — o oposto do que o input existe para
    // provocar. Quem digita o nome está afirmando que rodou ESTE arquivo.
    escreverSql('2026-09-01-nova-coluna.sql');
    escreverLedger([{ arquivo: '2026-09-01-nova-coluna.sql' }]);
    writeFileSync(path.join(dirSql(), '2026-09-01-nova-coluna.sql'), '-- DDL diferente;\n');

    expect((await rodarGuard()).code).toBe(1); // push normal trava

    const r = await rodarGuard(dispatch('2026-09-01-nova-coluna.sql'));
    expect(r.code).toBe(0);
    expect(r.stdout).toMatch(/Liberação manual aceita/);
  });

  it('dispatch sem input, com tudo coberto, libera (redeploy)', async () => {
    escreverSql('2026-08-01-um.sql');
    escreverLedger([{ arquivo: 'backend/prisma/sql/2026-08-01-um.sql' }]);

    const r = await rodarGuard({ GITHUB_EVENT_NAME: 'workflow_dispatch', SQL_APLICADO: '' });
    expect(r.code).toBe(0);
  });
});

/* ────────────── gatilho secundário: schema de produção ────────────── */

// Aqui a fixture é um REPOSITÓRIO GIT de verdade, porque este gatilho é o único
// pedaço do guard que ainda olha o diff do push. Nos blocos acima a fixture não
// é repo, então resolverRange() devolve null e o gatilho nem roda — foi
// exatamente por isso que o bug abaixo passou despercebido até a Fase B.
describe('Gatilho de schema — só trava quando o push NÃO trouxe .sql', () => {
  const gitFix = (...args) =>
    execFileSync('git', args, { cwd: raiz, encoding: 'utf8', stdio: 'pipe' }).trim();

  const arqSchema = () => path.join(raiz, 'backend', 'prisma', 'schema.mysql.prisma');
  const escreverSchema = (conteudo) => writeFileSync(arqSchema(), conteudo);

  function commitar(msg) {
    gitFix('add', '-A');
    gitFix('commit', '-q', '-m', msg);
    return gitFix('rev-parse', 'HEAD');
  }

  /** Repo com um commit-base contendo schema e ledger; devolve o SHA da base. */
  function repoComBase() {
    gitFix('init', '-q');
    gitFix('config', 'user.email', 'guard@teste.local');
    gitFix('config', 'user.name', 'Guard Teste');
    gitFix('config', 'commit.gpgsign', 'false');
    escreverSchema('model user {\n  id Int @id\n}\n');
    escreverLedger([]);
    return commitar('base');
  }

  it('BUG CORRIGIDO: schema + .sql no MESMO push não trava pelo gatilho', async () => {
    // O ritual correto quando o SQL já rodou no RDS: schema, DDL e a linha do
    // ledger vão juntos. Antes, isto travava acusando falta de um .sql que
    // estava no próprio push — e só o workflow_dispatch destravava.
    const antes = repoComBase();

    escreverSchema('model user {\n  id Int @id\n}\n\nmodel novo {\n  id Int @id\n}\n');
    escreverSql('2026-09-01-tabela-nova.sql');
    escreverLedger([{ arquivo: 'backend/prisma/sql/2026-09-01-tabela-nova.sql' }]);
    const depois = commitar('schema + sql + ledger');

    const r = await rodarGuard({ SHA_ANTES: antes, SHA_DEPOIS: depois });
    expect(r.code).toBe(0);
    expect(r.stderr).not.toMatch(/schema de produção alterado/);
    expect(r.stdout).toMatch(/Cobertura OK/);
  });

  it('o esquecimento legítimo continua travando: schema sem .sql nenhum', async () => {
    const antes = repoComBase();

    escreverSchema('model user {\n  id Int @id\n  novo_campo String\n}\n');
    const depois = commitar('só o schema');

    const r = await rodarGuard({ SHA_ANTES: antes, SHA_DEPOIS: depois });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/schema de produção alterado sem SQL manual/);
  });

  it('.sql sem tocar no schema: comportamento inalterado (libera se registrado)', async () => {
    const antes = repoComBase();

    escreverSql('2026-09-02-so-ddl.sql');
    escreverLedger([{ arquivo: 'backend/prisma/sql/2026-09-02-so-ddl.sql' }]);
    const depois = commitar('só o sql');

    const r = await rodarGuard({ SHA_ANTES: antes, SHA_DEPOIS: depois });
    expect(r.code).toBe(0);
  });

  it('.sql sem tocar no schema e SEM registro: trava pela cobertura, não pelo schema', async () => {
    const antes = repoComBase();

    escreverSql('2026-09-02-so-ddl.sql');
    const depois = commitar('sql sem registro');

    const r = await rodarGuard({ SHA_ANTES: antes, SHA_DEPOIS: depois });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/SQL manual pendente/);
    expect(r.stderr).not.toMatch(/schema de produção alterado/);
  });

  it('schema + .sql apenas MODIFICADO (já registrado) trava — agora pelo HASH', async () => {
    // Este teste nasceu quando o gatilho de schema era a ÚNICA rede para editar
    // um .sql já registrado: mesmo nome, DDL diferente, cobertura por nome cega.
    // Com a coluna Hash quem pega o caso é o gate de conteúdo, antes do gatilho,
    // e com mensagem que diz o que de fato aconteceu. Continua travando — muda
    // qual portão fecha, e para melhor.
    gitFix('init', '-q');
    gitFix('config', 'user.email', 'guard@teste.local');
    gitFix('config', 'user.name', 'Guard Teste');
    gitFix('config', 'commit.gpgsign', 'false');
    escreverSchema('model user {\n  id Int @id\n}\n');
    escreverSql('2026-08-01-antigo.sql');
    escreverLedger([{ arquivo: 'backend/prisma/sql/2026-08-01-antigo.sql' }]);
    const antes = commitar('base com sql já registrado');

    escreverSchema('model user {\n  id Int @id\n  outro String\n}\n');
    writeFileSync(path.join(dirSql(), '2026-08-01-antigo.sql'), '-- ALTER TABLE x ADD COLUMN z INT NULL;\n');
    const depois = commitar('schema + edição do sql antigo');

    const r = await rodarGuard({ SHA_ANTES: antes, SHA_DEPOIS: depois });
    expect(r.code).toBe(1);
    expect(r.stderr).toMatch(/alterado depois de registrado/);
  });
});
