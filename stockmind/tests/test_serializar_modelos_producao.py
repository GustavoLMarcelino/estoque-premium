import sys
import unittest
from pathlib import Path
from unittest import mock

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import gerar_previsao_producao as gpp  # noqa: E402
import serializar_modelos_producao as smp  # noqa: E402

F = smp.FEATURE_COLS_PRODUCAO


def historico(n=40, seed=0):
    r = np.random.default_rng(seed)
    d = pd.DataFrame(r.uniform(0, 10, size=(n, len(F))), columns=F)
    d["quantidade"] = np.round(0.4 * d["mm3"] + 0.5 * d["mm6"] - 3 + r.normal(0, 0.1, n)).clip(lower=0)
    return d


class TreinarProducaoTest(unittest.TestCase):
    def test_linha_com_feature_vazia_fica_de_fora_do_ajuste(self):
        h = historico()
        com_nan = h.copy()
        com_nan.loc[0, "mm6"] = np.nan  # linha incompleta: não pode entrar
        reg_a, _ = smp.treinar_producao(com_nan)
        reg_b, _ = smp.treinar_producao(h.drop(index=0))
        np.testing.assert_allclose(reg_a.coef_, reg_b.coef_)

    def test_reajuste_reproduz_os_mesmos_coeficientes(self):
        reg_1, clf_1 = smp.treinar_producao(historico())
        reg_2, clf_2 = smp.treinar_producao(historico())
        np.testing.assert_array_equal(reg_1.coef_, reg_2.coef_)
        np.testing.assert_array_equal(clf_1.coef_, clf_2.coef_)

    def test_classificador_aprende_venda_maior_que_zero(self):
        h = historico()
        _, clf = smp.treinar_producao(h)
        self.assertEqual(set(clf.classes_), {0, 1})
        self.assertEqual(clf.predict_proba(h[F]).shape, (len(h), 2))


class ProducaoCarregaOsPklDeProducaoTest(unittest.TestCase):
    def test_gerar_previsao_nao_usa_os_pkl_do_tcc(self):
        chamados = []

        class Stub:
            def predict(self, X):
                return np.ones(len(X))

            def predict_proba(self, X):
                return np.full((len(X), 2), 0.5)

        def falso_load(caminho):
            chamados.append(Path(caminho).name)
            return Stub()

        feats = pd.DataFrame(
            {c: [1.0] for c in F} | {"n_mm3": [3], "n_mm6": [6]},
            index=pd.MultiIndex.from_tuples([("carro", 60.0, "Convencional")], names=gpp.COLUNAS_GROSSA),
        )
        with mock.patch.object(gpp.joblib, "load", side_effect=falso_load):
            gpp.prever_demanda_grossa(feats, [("carro", 60.0, "Convencional")])
        self.assertEqual(sorted(chamados), ["classificador_producao.pkl", "regressao_linear_producao.pkl"])


if __name__ == "__main__":
    unittest.main()
