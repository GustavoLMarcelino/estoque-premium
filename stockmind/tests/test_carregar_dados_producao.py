import sys
import unittest
from pathlib import Path

from sqlalchemy import create_engine, text

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import gerar_previsao_producao as gpp  # noqa: E402


def banco_de_teste():
    engine = create_engine("sqlite://")
    with engine.begin() as c:
        c.execute(text("CREATE TABLE marca (id INTEGER PRIMARY KEY, nome TEXT, ativo INTEGER)"))
        c.execute(text(
            "CREATE TABLE estoque (id INTEGER PRIMARY KEY, produto TEXT, modelo TEXT, qtd_minima INTEGER, em_estoque INTEGER,"
            " qtd_inicial INTEGER, entradas INTEGER, saidas INTEGER, marca_id INTEGER)"))
        c.execute(text(
            "CREATE TABLE movimentacoes (id INTEGER PRIMARY KEY, produto_id INTEGER, tipo TEXT, quantidade INTEGER,"
            " data_movimentacao TEXT, garantia_id INTEGER, motivo TEXT)"))
        c.execute(text("INSERT INTO marca VALUES (1, 'Moura', 1)"))
        c.execute(text("INSERT INTO estoque VALUES (1, 'Moura M60AD', '60AH', 2, NULL, 10, 0, 0, 1)"))
        c.execute(text(
            "INSERT INTO movimentacoes VALUES"
            " (1, 1, 'SAIDA', 1, '2026-10-10 10:00:00', NULL, NULL),"                                  # venda
            " (2, 1, 'SAIDA', 1, '2026-10-13 12:56:34', 7, 'Empréstimo garantia #7'),"                  # empréstimo
            " (3, 1, 'ENTRADA', 1, '2026-10-14 09:00:00', 7, 'Devolução empréstimo garantia #7')"))     # devolução
    return engine


class EmprestimoDeGarantiaNaoEVendaTest(unittest.TestCase):
    def test_saida_de_emprestimo_fica_fora_do_historico_de_vendas(self):
        _, movimentos, inicio = gpp.carregar_dados_producao(banco_de_teste())
        self.assertEqual(movimentos["produto_id"].tolist(), [1])
        self.assertEqual(int(movimentos["quantidade"].sum()), 1)
        # a cobertura de dados da produção continua contando TODA movimentação
        self.assertEqual(str(inicio), "2026-10-10 10:00:00")


if __name__ == "__main__":
    unittest.main()
