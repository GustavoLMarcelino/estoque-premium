// Regras compartilhadas entre o guard (guard-sql-pendente.mjs) e o gerador de
// linha do ledger (gerar-hash-sql.mjs).
//
// Existe para que o hash conferido e o hash gerado sejam LITERALMENTE a mesma
// função. Duas implementações "iguais" divergiriam no primeiro detalhe de
// normalização, e a divergência apareceria como deploy travado sem motivo.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Os dois diretórios de SQL manual do projeto (convenções de nome diferentes,
 *  mesmo papel: DDL que precisa rodar no RDS a mão). */
export const DIRS_SQL = ['backend/prisma/sql', 'backend/prisma/manual'];

/** Quantos hex do sha256 vão para o ledger. 12 é o tamanho do short-sha do git,
 *  legível numa tabela editada a mão. A comparação é por prefixo, então colar o
 *  hash inteiro também funciona. */
export const HASH_EXIBIDO = 12;

/** Formato aceito na coluna Hash. Mínimo de 8 para que um prefixo curto demais
 *  seja recusado como inválido em vez de virar "quase igual". */
export const FORMATO_HASH = /^[0-9a-f]{8,64}$/i;

/** Prefixo de exclusão: .sql que NÃO é DDL de produção (rollback guardado,
 *  consulta de diagnóstico, exemplo). Fica no MESMO diretório dos DDL reais e
 *  aparece no mesmo `ls` — ao contrário de uma subpasta, que sumiria da
 *  listagem (readdirSync não é recursivo) e deixaria "mover para cá" virar
 *  bypass silencioso do guard. */
export const PREFIXO_IGNORADO = '_';

export const ehIgnorado = (nome) => String(nome).startsWith(PREFIXO_IGNORADO);

/**
 * Hash do CONTEÚDO de um .sql, com CRLF normalizado para LF.
 *
 * A NORMALIZAÇÃO É O PONTO. Verificado num clone limpo desta máquina
 * (core.autocrlf=true): o mesmo arquivo materializa CRLF no Windows e LF no
 * runner Linux, e o sha256 dos bytes crus dá valores DIFERENTES nos dois — o
 * guard travaria todo deploy acusando divergência que não existe.
 *
 * Normalizar aqui, em JS, e não depender de .gitattributes nem de
 * `git hash-object`: o valor passa a não depender de git instalado, de estar
 * dentro de um repositório, nem da config de EOL do ambiente. O .gitattributes
 * do repo é defesa em profundidade, não premissa desta função.
 */
export function hashDe(abs) {
  const conteudo = readFileSync(abs, 'utf8').replace(/\r\n/g, '\n');
  return createHash('sha256').update(conteudo, 'utf8').digest('hex');
}
