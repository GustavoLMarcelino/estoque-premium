import sys
import unittest
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from metricas import (  # noqa: E402
    erros_escalados,
    escala_mase_por_grupo,
    mae,
    mape_mdape,
    mase,
    media_aparada,
    vies,
)
from previsores_baseline import croston_um_passo, prever_croston  # noqa: E402

S = pd.Series


class MetricasTest(unittest.TestCase):
    def test_mape_ignora_real_zero_e_sem_previsao(self):
        r = mape_mdape(S([10, 0, 20, 5]), S([5, 3, 30, np.nan]))
        # válidas: (10,5)->50%, (20,30)->50%; real 0 ignorado; NaN sem previsão
        self.assertEqual((r["n_usado"], r["n_atual_zero"], r["n_sem_previsao"]), (2, 1, 1))
        self.assertAlmostEqual(r["MAPE"], 50.0)

    def test_escala_do_mase_e_a_diferenca_media_do_mes_anterior(self):
        df = pd.DataFrame({"grupo": ["a"] * 4 + ["b"] * 3, "mes": list(range(4)) + list(range(3)),
                           "quantidade": [1, 3, 3, 7, 5, 5, 5]})
        escalas, _, sem_variacao = escala_mase_por_grupo(df)
        self.assertAlmostEqual(escalas["a"], (2 + 0 + 4) / 3)
        self.assertEqual((escalas["b"], sem_variacao), (0.0, ["b"]))

    def test_mase_calculado_a_mao(self):
        y, p = S([4.0, 10.0, 2.0]), S([2.0, 6.0, 2.0])
        g = S(["a", "a", "a"])
        r = mase(y, p, g, {"a": 2.0})
        self.assertAlmostEqual(r["MASE"], (1.0 + 2.0 + 0.0) / 3)
        self.assertEqual(list(erros_escalados(y, p, g, {"a": 2.0})), [1.0, 2.0, 0.0])

    def test_mase_exclui_escala_zero_e_sem_previsao(self):
        r = mase(S([1.0, 1.0, 1.0]), S([2.0, np.nan, 2.0]), S(["a", "a", "z"]), {"a": 1.0, "z": 0.0})
        self.assertEqual((r["n_usado"], r["n_sem_previsao"], r["n_escala_zero"]), (1, 1, 1))

    def test_media_aparada_remove_os_5_por_cento_piores(self):
        erros = S([1.0] * 19 + [100.0])
        self.assertAlmostEqual(media_aparada(erros), 1.0)
        self.assertGreater(erros.mean(), 5)

    def test_vies_positivo_quando_preve_acima(self):
        self.assertAlmostEqual(vies(S([1.0, 3.0]), S([2.0, 5.0])), 1.5)
        self.assertAlmostEqual(mae(S([1.0, 3.0]), S([2.0, 5.0])), 1.5)
        self.assertAlmostEqual(vies(S([1.0, 3.0]), S([0.0, 1.0])), -1.5)


class CrostonTest(unittest.TestCase):
    def test_sem_venda_previa_nao_ha_previsao(self):
        p = croston_um_passo([0, 0, 5, 0], alpha=0.1)
        self.assertTrue(np.isnan(p[0]) and np.isnan(p[1]) and np.isnan(p[2]))
        self.assertFalse(np.isnan(p[3]))

    def test_demanda_constante_croston_acerta_e_sba_corrige_para_baixo(self):
        self.assertTrue(np.allclose(croston_um_passo([5] * 6, 0.2)[1:], 5.0))
        self.assertTrue(np.allclose(croston_um_passo([5] * 6, 0.2, sba=True)[1:], 5.0 * 0.9))

    def test_calculado_a_mao_com_demanda_intermitente(self):
        # y = [4, 0, 0, 8]; alpha=0.5
        # t0: z=4, p=1 (1a venda no mês 1). t1,t2: sem venda, q=3. t3 prevê z/p = 4
        p = croston_um_passo([4, 0, 0, 8, 0], alpha=0.5)
        self.assertEqual(p[1], 4.0)
        self.assertEqual(p[3], 4.0)
        # em t3 vendeu 8 após q=3: z = 4+0.5*(8-4) = 6 ; p = 1+0.5*(3-1) = 2 -> prev t4 = 3
        self.assertAlmostEqual(p[4], 3.0)

    def test_nao_olha_o_futuro(self):
        a = croston_um_passo([3, 0, 4, 9, 9], 0.3)
        b = croston_um_passo([3, 0, 4, 100, 0], 0.3)  # só muda de t=3 em diante
        self.assertTrue(np.allclose(a[:4], b[:4], equal_nan=True))

    def test_por_grupo_alinhado_ao_indice(self):
        df = pd.DataFrame({"grupo": ["a", "b", "a", "b"], "mes": [2, 1, 1, 2], "quantidade": [3, 0, 6, 4]}, index=[10, 11, 12, 13])
        out = prever_croston(df, 0.5)
        self.assertTrue(np.isnan(out[12]))  # a, mês 1: primeira observação
        self.assertEqual(out[10], 6.0)  # a, mês 2: z=6, p=1
        self.assertTrue(np.isnan(out[11]) and np.isnan(out[13]))  # b: mês 1 sem venda; mês 2 ainda sem venda prévia


if __name__ == "__main__":
    unittest.main()
