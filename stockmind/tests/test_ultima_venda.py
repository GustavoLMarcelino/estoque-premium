import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from classificar_produto import classificar_produto  # noqa: E402
from ultima_venda import (  # noqa: E402
    NIVEL_GROSSO,
    NIVEL_SUBGRUPO,
    marca_do_cadastro,
    marca_do_excel,
    ultima_venda_historica,
    ultimas_vendas_historico,
)


def vendas(*linhas):
    return pd.DataFrame(linhas, columns=["data", "produto", "quantidade", "amperagem_ah", "categoria"]).assign(
        data=lambda d: pd.to_datetime(d["data"])
    )


class MarcaTest(unittest.TestCase):
    def test_tabela_de_marcas_aprovada(self):
        casos = {
            "ELETRAM 180AH": "ELETRAN", "PIOBAT 60AH": "PIONEIRO", "Piobate F60DN": "PIONEIRO",
            "MBR10-BS": "PIONEIRO", "MBR9-L9BS": "PIONEIRO", "HTZ6L": "HELIAR", "HTZ10S-BS": "HELIAR",
            "HEIZER 7AH": "HAZER", "HZR6L-BS": "HAZER", "NICOLL 7AH": "GETPOWER", "DF500": "FREEDOM",
            "JUPITER 50AH": "JUPITER", "Júpiter JJF70D": "JUPITER",
        }
        for produto, marca in casos.items():
            with self.subTest(produto=produto):
                self.assertEqual(marca_do_excel(produto), marca)

    def test_marca_do_cadastro(self):
        self.assertEqual(marca_do_cadastro("Júpiter"), "JUPITER")
        self.assertEqual(marca_do_cadastro("Hazer"), "HAZER")
        self.assertEqual(marca_do_cadastro("Nicoll"), "GETPOWER")


class UltimaVendaHistoricaTest(unittest.TestCase):
    def setUp(self):
        self.sub, self.gro = ultimas_vendas_historico(vendas(
            ("2026-09-26", "ELETRAN 60AH", 1, 60.0, "convencional"),
            ("2026-08-01", "ELETRAN 60AH 18M", 1, 60.0, "convencional"),
            ("2026-09-20", "JUPITER 50AH CIVIC", 1, 50.0, "convencional"),
            ("2026-07-15", "JUPITER 50AH", 1, 50.0, "convencional"),
            ("2025-04-15", "MBR10-BS", 1, 10.0, "moto"),
        ))

    def busca(self, marca, nome):
        return ultima_venda_historica(marca, classificar_produto(nome), self.sub, self.gro)

    def test_pega_a_data_mais_recente_do_grupo(self):
        data, nivel = self.busca("Eletran", "Eletran 60APD Advanced 60AH")
        self.assertEqual((data, nivel), (pd.Timestamp("2026-09-26"), NIVEL_SUBGRUPO))

    def test_skus_irmaos_recebem_a_mesma_data(self):
        a = self.busca("Eletran", "Eletran 60APD Advanced 60AH")
        b = self.busca("Eletran", "Eletran 60PDUT Ultra 60AH")
        self.assertEqual(a, b)

    def test_caixa_diferente_nao_mistura_quando_o_subgrupo_existe(self):
        data, nivel = self.busca("Júpiter", "Júpiter JJFA50HD Civic 50AH")
        self.assertEqual((data, nivel), (pd.Timestamp("2026-09-20"), NIVEL_SUBGRUPO))

    def test_sem_o_subgrupo_cai_no_grupo_grosso(self):
        # o livro só diz "50": não há "50 Alta" no histórico, então vale a marca + 50AH
        data, nivel = self.busca("Júpiter", "Júpiter JJFA50PD Alt 50AH")
        self.assertEqual((data, nivel), (pd.Timestamp("2026-09-20"), NIVEL_GROSSO))

    def test_marca_do_excel_casa_com_a_do_cadastro(self):
        data, _ = self.busca("Pioneiro", "Pioneiro MBR10-BS 10AH")
        self.assertEqual(data, pd.Timestamp("2025-04-15"))

    def test_nunca_vendeu_devolve_none(self):
        self.assertEqual(self.busca("Heliar", "Heliar HAGM60HD AGM 60AH"), (None, None))
        self.assertEqual(self.busca("Moura", "Moura M60AD 60AH"), (None, None))


if __name__ == "__main__":
    unittest.main()
