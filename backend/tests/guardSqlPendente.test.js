// Guard de deploy — o gate por COBERTURA que substituiu a detecção por range.
//
// Roda o SCRIPT DE VERDADE (execFile), com GUARD_RAIZ apontando para um
// diretório-fixture: nada aqui reimplementa a lógica do guard, então um bug no
// script quebra o teste. É infra crítica — testar uma cópia da lógica não valeria.
//
// O furo que motivou a mudança está no cenário B: um .sql não registrado, num
// push que NÃO o traz. A versão por range liberava; a por cobertura bloqueia.
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { execFile } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
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

/** Ledger com as linhas informadas na coluna "Arquivo". */
function escreverLedger(linhas) {
  const corpo = [
    '# SQL manual aplicado no RDS (produção)',
    '',
    'Texto de prosa que menciona um arquivo-armadilha: nao-registrado.sql',
    '',
    '## Aplicados',
    '',
    '| Arquivo | Data (aplicado no RDS) | Quem rodou | Observação |',
    '|---|---|---|---|',
    ...linhas,
    '',
    '<!-- Exemplo em comentário, não vale como registro:',
    '| backend/prisma/sql/dentro-do-comentario.sql | 01/01/2026 | X | — |',
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
    escreverLedger(['| backend/prisma/sql/2026-08-01-antigo.sql | 01/08/2026 | Gustavo | — |']);

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
      '| backend/prisma/sql/2026-08-01-um.sql | 01/08/2026 | Gustavo | — |',
      '| backend/prisma/sql/2026-08-02-dois.sql | 02/08/2026 | Gustavo | — |',
      '| backend/prisma/manual/20260709_manual.sql | 09/07/2026 | Gustavo | — |',
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

    escreverLedger(['| backend/prisma/sql/2026-09-01-nova-coluna.sql | 01/09/2026 | Gustavo | DDL. |']);
    const depois = await rodarGuard();
    expect(depois.code).toBe(0);
    expect(depois.stdout).toMatch(/Cobertura OK/);
  });
});

/* ─────────────────── robustez do parsing do ledger ─────────────────── */

describe('Parsing do APLICADOS.md', () => {
  it('aceita nome puro (sem caminho) na coluna Arquivo', async () => {
    escreverSql('2026-09-01-nova-coluna.sql');
    escreverLedger(['| 2026-09-01-nova-coluna.sql | 01/09/2026 | Gustavo | — |']);
    expect((await rodarGuard()).code).toBe(0);
  });

  it('tolera espaços sobrando em volta da célula', async () => {
    escreverSql('2026-09-01-nova-coluna.sql');
    escreverLedger(['|      backend/prisma/sql/2026-09-01-nova-coluna.sql    | 01/09/2026 | G | — |']);
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
      '| backend/prisma/sql/2026-09-01-nova-coluna.sql | 01/09/2026 | G | — |',
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

  it('dispatch sem input, com tudo coberto, libera (redeploy)', async () => {
    escreverSql('2026-08-01-um.sql');
    escreverLedger(['| backend/prisma/sql/2026-08-01-um.sql | 01/08/2026 | G | — |']);

    const r = await rodarGuard({ GITHUB_EVENT_NAME: 'workflow_dispatch', SQL_APLICADO: '' });
    expect(r.code).toBe(0);
  });
});
