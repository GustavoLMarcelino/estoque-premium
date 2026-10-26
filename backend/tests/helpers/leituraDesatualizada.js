import { vi } from 'vitest';

/**
 * Simula, nos testes (SQLite), o que o MySQL faz em produção.
 *
 * O SQLite serializa as transações (uma conexão só): a segunda só começa depois
 * que a primeira terminou, então a corrida "dois lançamentos leem o mesmo saldo"
 * NUNCA acontece nele — um teste com Promise.all passa até com o código
 * ingênuo "lê saidas, soma, grava". No MySQL (REPEATABLE READ) o SELECT lê um
 * snapshot de quando a transação começou, e o UPDATE enxerga o valor mais novo:
 * a leitura fica desatualizada em relação à escrita.
 *
 * Aqui o findUnique de estoque/estoque_som, DENTRO de transação, devolve a linha
 * como estava quando esta função foi chamada. Quem decide o saldo pela leitura
 * (check-then-write, ou soma em JS e grava o total) erra; quem usa increment e
 * confere o saldo na linha devolvida pelo update continua certo.
 *
 * @returns {() => void} restaura o comportamento normal
 */
export async function congelarLeituras(prisma, modelos = ['estoque', 'estoque_som']) {
  const snap = {};
  for (const m of modelos) {
    snap[m] = new Map((await prisma[m].findMany()).map((r) => [r.id, r]));
  }

  const original = prisma.$transaction.bind(prisma);

  const comLeituraCongelada = (tx) => new Proxy(tx, {
    get(alvo, prop) {
      const valor = alvo[prop];
      if (snap[prop] && valor && typeof valor === 'object') {
        return new Proxy(valor, {
          get(delegate, metodo) {
            if (metodo === 'findUnique') {
              return async (args) => snap[prop].get(args?.where?.id) ?? delegate.findUnique(args);
            }
            const f = delegate[metodo];
            return typeof f === 'function' ? f.bind(delegate) : f;
          },
        });
      }
      return typeof valor === 'function' ? valor.bind(alvo) : valor;
    },
  });

  const spy = vi.spyOn(prisma, '$transaction').mockImplementation((fn, opts) =>
    (typeof fn === 'function' ? original((tx) => fn(comLeituraCongelada(tx)), opts) : original(fn, opts)));

  return () => spy.mockRestore();
}
