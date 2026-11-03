import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from features_producao import (  # noqa: E402
    classificar_confianca,
    calcular_features_por_grupo,
    dias_cobertos_na_janela,
    descrever_lacuna,
    fracao_coberta,
    intervalos_de_cobertura,
)

TS = pd.Timestamp
CHAVE = ("carro", 60.0, "Convencional")


def historico(vendas):
    """vendas: {'2026-04': qtd, ...} de um grupo grosso."""
    return pd.DataFrame(
        [{"categoria": CHAVE[0], "amperagem": CHAVE[1], "tecnologia": CHAVE[2], "mes": TS(m + "-01"), "quantidade": q}
         for m, q in vendas.items()]
    )


def meses(inicio, fim, valor):
    return {m.strftime("%Y-%m"): valor for m in pd.date_range(inicio, fim, freq="MS")}


# Cenário real: Excel até 30/04/2026, sistema desde 09/10/2026, previsão de novembro.
EXCEL_INI, EXCEL_FIM, PRODUCAO_INI, MES_PREVISTO = TS("2023-05-04"), TS("2026-04-30"), TS("2026-10-09 14:39"), TS("2026-11-01")


class CoberturaTest(unittest.TestCase):
    def test_intervalos_do_cenario_real(self):
        iv = intervalos_de_cobertura(EXCEL_INI, EXCEL_FIM, PRODUCAO_INI, MES_PREVISTO)
        self.assertEqual(iv, [(TS("2023-05-01"), TS("2026-05-01")), (TS("2026-10-09"), TS("2026-11-01"))])

    def test_fracao_por_mes(self):
        iv = intervalos_de_cobertura(EXCEL_INI, EXCEL_FIM, PRODUCAO_INI, MES_PREVISTO)
        self.assertEqual(fracao_coberta(TS("2026-04-01"), iv), 1.0)
        self.assertEqual(fracao_coberta(TS("2026-07-01"), iv), 0.0)  # lacuna
        self.assertAlmostEqual(fracao_coberta(TS("2026-10-01"), iv), 23 / 31)

    def test_excel_atualizado_para_cobrir_a_lacuna_nao_duplica_a_producao(self):
        # planilha estendida até 20/10: a produção só vale depois disso
        iv = intervalos_de_cobertura(EXCEL_INI, TS("2026-10-20"), PRODUCAO_INI, MES_PREVISTO)
        self.assertEqual(iv, [(TS("2023-05-01"), TS("2026-10-21")), (TS("2026-10-21"), TS("2026-11-01"))])
        self.assertEqual(fracao_coberta(TS("2026-10-01"), iv), 1.0)

    def test_dias_com_dado_real_na_janela_de_6_meses(self):
        iv = intervalos_de_cobertura(EXCEL_INI, EXCEL_FIM, PRODUCAO_INI, MES_PREVISTO)
        self.assertEqual(dias_cobertos_na_janela(iv, MES_PREVISTO, 6), 23)  # só 09/10 a 31/10
        continuo = intervalos_de_cobertura(EXCEL_INI, TS("2026-10-31"), None, MES_PREVISTO)
        self.assertEqual(dias_cobertos_na_janela(continuo, MES_PREVISTO, 6), 184)  # 01/05 a 31/10
        sem_nada = intervalos_de_cobertura(EXCEL_INI, EXCEL_FIM, None, MES_PREVISTO)
        self.assertEqual(dias_cobertos_na_janela(sem_nada, MES_PREVISTO, 6), 0)

    def test_sem_movimentacao_na_producao_so_o_excel_cobre(self):
        iv = intervalos_de_cobertura(EXCEL_INI, EXCEL_FIM, None, MES_PREVISTO)
        self.assertEqual(len(iv), 1)


class FeaturesComLacunaTest(unittest.TestCase):
    def setUp(self):
        self.iv = intervalos_de_cobertura(EXCEL_INI, EXCEL_FIM, PRODUCAO_INI, MES_PREVISTO)
        vendas = {**meses("2025-05-01", "2026-04-01", 90), "2025-11": 54, "2026-10": 32}
        self.f = calcular_features_por_grupo(historico(vendas), MES_PREVISTO, self.iv).loc[CHAVE]

    def test_meses_sem_dado_nao_viram_zero_nas_medias(self):
        # janela de 3 (ago-out) e de 6 (mai-out): só outubro tem dado; proporcionalizado 32 / (23/31)
        self.assertAlmostEqual(self.f["mm3"], 32 * 31 / 23)
        self.assertAlmostEqual(self.f["mm6"], 32 * 31 / 23)
        self.assertEqual((self.f["n_mm3"], self.f["n_mm6"]), (1, 1))

    def test_meses_antigos_do_excel_nao_entram_na_media_recente(self):
        self.assertGreater(self.f["mm3"], 40)  # nem a 90/mês do Excel, nem a ~10 dos zeros

    def test_qty_mesmo_mes_do_ano_anterior_vem_do_excel(self):
        self.assertEqual(self.f["qty_mesmo_mes_ano_anterior"], 54)

    def test_tempo_desde_ultima_venda_e_em_meses_de_calendario(self):
        self.assertEqual(self.f["tempo_desde_ultima_venda_meses"], 1)

    def test_com_lacuna_a_confianca_cai_para_media_e_ha_aviso(self):
        self.assertEqual(classificar_confianca(self.f), "media")
        self.assertIn("1 de 3 meses", descrever_lacuna(self.f))
        self.assertIn("não contados como zero", descrever_lacuna(self.f))

    def test_janela_sem_nenhum_mes_coberto_nao_inventa_previsao(self):
        # sem produção: ago-out inteiros sem dado -> mm3/mm6 NaN, nada de média de zeros
        iv = intervalos_de_cobertura(EXCEL_INI, EXCEL_FIM, None, MES_PREVISTO)
        f = calcular_features_por_grupo(historico(meses("2025-05-01", "2026-04-01", 90)), MES_PREVISTO, iv).loc[CHAVE]
        self.assertTrue(np.isnan(f["mm3"]) and np.isnan(f["mm6"]))
        self.assertNotEqual(classificar_confianca(f), "alta")


class FeaturesSemLacunaTest(unittest.TestCase):
    def test_serie_continua_mantem_media_simples_e_confianca_alta(self):
        iv = intervalos_de_cobertura(TS("2023-05-01"), TS("2026-10-31"), None, MES_PREVISTO)
        vendas = meses("2025-01-01", "2026-10-01", 10)
        vendas.update({"2026-08": 30, "2026-09": 0, "2026-10": 60})
        f = calcular_features_por_grupo(historico(vendas), MES_PREVISTO, iv).loc[CHAVE]
        self.assertAlmostEqual(f["mm3"], 30.0)  # (30 + 0 + 60) / 3: mês coberto sem venda é zero de verdade
        self.assertEqual(classificar_confianca(f), "alta")
        self.assertIsNone(descrever_lacuna(f))


if __name__ == "__main__":
    unittest.main()
