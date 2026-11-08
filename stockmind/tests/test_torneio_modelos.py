import json
import sys
import tempfile
import unittest
from argparse import Namespace
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import torneio_modelos as tm  # noqa: E402
from metricas import FEATURE_COLS, escala_mase_por_grupo, mase  # noqa: E402

MODELOS_RAPIDOS = {
    "media_movel_3m": [{}],
    "naive_sazonal": [{}],
    "croston": [{"alpha": 0.2}],
    "sba": [{"alpha": 0.2}],
    "regressao_linear": [{}],
    "arvore": [{"max_depth": 3}, {"max_depth": None}],
    "random_forest": [{"n_estimators": 10, "max_depth": 3}],
    "mlp": [{"arquitetura": (4,)}],
}


def serie_sintetica(inicio="2023-01-01", fim="2026-03-01", seed=0):
    """3 grupos com demanda mensal; features calculadas só com o passado (como no gerar_features)."""
    rng = np.random.default_rng(seed)
    linhas = []
    for g, nivel in (("g1", 8), ("g2", 3), ("g3", 1)):
        meses = pd.date_range(inicio, fim, freq="MS")
        q = pd.Series(rng.poisson(nivel, len(meses)).astype(float), index=meses)
        passado = q.shift(1)
        f = pd.DataFrame({
            "grupo": g, "mes": meses, "quantidade": q.to_numpy(),
            "mm3": passado.rolling(3).mean().to_numpy(), "mm6": passado.rolling(6).mean().to_numpy(),
            "mes_sin": np.sin(2 * np.pi * meses.month / 12), "mes_cos": np.cos(2 * np.pi * meses.month / 12),
            "qty_mesmo_mes_ano_anterior": q.shift(12).to_numpy(), "tempo_desde_ultima_venda_meses": 1.0,
        })
        linhas.append(f)
    return pd.concat(linhas, ignore_index=True)


def particoes(df):
    treino = df[df["mes"] <= "2025-06-01"].reset_index(drop=True)
    teste = df[(df["mes"] > "2025-06-01") & (df["mes"] <= "2025-12-01")].reset_index(drop=True)
    holdout = df[df["mes"] > "2025-12-01"].reset_index(drop=True)
    return treino, teste, holdout


class DobrasSemVazamentoTest(unittest.TestCase):
    def setUp(self):
        treino, teste, _ = particoes(serie_sintetica())
        self.D = tm.montar_dados(treino, teste)

    def test_origens_sao_os_ultimos_meses_do_treino(self):
        o = tm.origens_de_validacao(self.D, 4)
        self.assertEqual([m.strftime("%Y-%m") for m in o], ["2025-03", "2025-04", "2025-05", "2025-06"])

    def test_treino_da_dobra_e_estritamente_anterior_e_nunca_inclui_o_teste(self):
        for origem in tm.origens_de_validacao(self.D, 6):
            tr, alvo = tm.mascaras_da_dobra(self.D, origem)
            self.assertTrue((self.D.loc[tr, "mes"] < origem).all())
            self.assertTrue((self.D.loc[alvo, "mes"] == origem).all())
            self.assertTrue((self.D.loc[tr | alvo, "parte"] == "treino").all())

    def test_validacao_nao_muda_se_o_teste_mudar(self):
        a = tm.rodar_validacao(self.D, MODELOS_RAPIDOS, n_dobras=3)
        D2 = self.D.copy()
        no_teste = D2["parte"] == "teste"
        D2.loc[no_teste, "quantidade"] = 9999.0
        D2.loc[no_teste, FEATURE_COLS[0]] = 12345.0
        b = tm.rodar_validacao(D2, MODELOS_RAPIDOS, n_dobras=3)
        self.assertEqual(a.keys(), b.keys())
        for k in a:
            pd.testing.assert_frame_equal(a[k].reset_index(drop=True), b[k].reset_index(drop=True))


class CampeaoTest(unittest.TestCase):
    def tabela(self, linhas):
        return pd.DataFrame(linhas, columns=["modelo", "MASE", "vies"]).set_index("modelo")

    def test_sem_empate_vence_o_menor_mase(self):
        t = self.tabela([("media_movel_3m", 1.00, 0.9), ("regressao_linear", 1.20, 0.1)])
        self.assertEqual(tm.escolher_campeao(t)[0], "media_movel_3m")

    def test_empate_prefere_o_menor_vies_nao_negativo(self):
        t = self.tabela([("media_movel_3m", 1.00, -0.5), ("regressao_linear", 1.03, 0.4), ("arvore", 1.04, 0.1)])
        campeao, motivo = tm.escolher_campeao(t)
        self.assertEqual(campeao, "arvore")  # dentro da tolerância; viés +0.1 é o menor não negativo
        self.assertIn("Empate técnico", motivo)

    def test_empate_sem_vies_nao_negativo_escolhe_o_mais_proximo_de_zero(self):
        t = self.tabela([("media_movel_3m", 1.00, -0.9), ("regressao_linear", 1.02, -0.1)])
        self.assertEqual(tm.escolher_campeao(t)[0], "regressao_linear")

    def test_fora_da_tolerancia_nao_entra_no_empate(self):
        t = self.tabela([("media_movel_3m", 1.00, -0.2), ("regressao_linear", 1.06, 0.1)])
        self.assertEqual(tm.escolher_campeao(t)[0], "media_movel_3m")  # 1.06 > 1.00 + 0.05

    def test_empate_total_fica_com_o_mais_simples(self):
        t = self.tabela([("arvore", 1.00, 0.3), ("media_movel_3m", 1.00, 0.3)])
        self.assertEqual(tm.escolher_campeao(t)[0], "media_movel_3m")


class BootstrapEMetricasTest(unittest.TestCase):
    def quadro(self, erros):
        return pd.DataFrame({"grupo": ["a", "a", "b", "b", "c", "c"], "erro_esc": erros})

    def test_modelos_iguais_diferenca_zero(self):
        f = self.quadro([1, 2, 3, 4, 5, 6.0])
        self.assertEqual(tm.bootstrap_diferenca_mase(f, f), (0.0, 0.0, 0.0))

    def test_pior_por_constante_tem_ic_em_torno_da_constante_e_e_deterministico(self):
        base, pior = self.quadro([1, 2, 3, 4, 5, 6.0]), self.quadro([2, 3, 4, 5, 6, 7.0])
        r1, r2 = tm.bootstrap_diferenca_mase(pior, base), tm.bootstrap_diferenca_mase(pior, base)
        self.assertEqual(r1, r2)
        self.assertEqual(r1, (1.0, 1.0, 1.0))

    def test_ic_largo_quando_os_grupos_discordam(self):
        modelo, base = self.quadro([0, 0, 5, 5, 0, 0.0]), self.quadro([2, 2, 2, 2, 2, 2.0])
        media, lo, hi = tm.bootstrap_diferenca_mase(modelo, base)
        self.assertLess(lo, 0)
        self.assertGreater(hi, 0)

    def test_mase_do_torneio_igual_ao_de_metricas(self):
        treino, teste, _ = particoes(serie_sintetica())
        D = tm.montar_dados(treino, teste)
        alvo = (D["parte"] == "teste") & D["completo"] & D["grupo"].isin(set(treino["grupo"]))
        escalas = escala_mase_por_grupo(D[D["parte"] == "treino"])[0]
        pred = tm.prever("media_movel_3m", {}, D, D["parte"] == "treino", alvo, {})
        r = tm.resumir(tm.quadro(D, alvo, pred, escalas))
        ref = mase(D.loc[alvo, "quantidade"], pred[alvo], D.loc[alvo, "grupo"], escalas)
        self.assertAlmostEqual(r["MASE"], ref["MASE"])
        self.assertEqual(r["n_mase"], ref["n_usado"])


class FimAFimTest(unittest.TestCase):
    def setUp(self):
        treino, teste, holdout = particoes(serie_sintetica())
        self.treino, self.teste, self.holdout = treino, teste, holdout
        self.D = tm.montar_dados(treino, teste)

    def test_torneio_completo_gera_campeao_teste_bootstrap_e_cobertura(self):
        val = tm.executar_torneio(self.D, MODELOS_RAPIDOS, n_dobras=3)
        self.assertIn(val["campeao"], MODELOS_RAPIDOS)
        self.assertEqual(set(val["escolhas"]), set(MODELOS_RAPIDOS))
        tabela, quadros, sem = tm.avaliar_em_parte(self.D, "teste", val["escolhas"], ["treino"], list(MODELOS_RAPIDOS))
        tabela = tm.adicionar_bootstrap(tabela, quadros)
        self.assertEqual(sem, {})  # todos os modelos preveem todas as linhas comuns
        self.assertEqual(tabela.loc["media_movel_3m", "dif_MASE_vs_base"], 0.0)
        self.assertTrue((tabela["n_linhas"] == tabela["n_linhas"].iloc[0]).all())  # mesmas linhas para todos
        # cobertura própria: média móvel prevê tudo que tem mm3; a regressão exige as 6 features
        self.assertGreaterEqual(tabela.loc["media_movel_3m", "cobertura_linhas"], tabela.loc["regressao_linear", "cobertura_linhas"])
        with tempfile.TemporaryDirectory() as tmp:
            pasta = Path(tmp)
            tm.escrever_relatorio_torneio(pasta, val, tabela, sem, {"features_treino.csv": "0" * 64}, False)
            md = (pasta / "torneio.md").read_text(encoding="utf-8")
        for trecho in ("## Validação", "## Teste congelado", "## Cobertura no teste", "Campeão", "seed"):
            self.assertIn(trecho, md)

    def test_registro_impede_segunda_avaliacao(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.assertFalse(tm.ja_avaliado(tmp, "teste_congelado", "abc"))
            tm.registrar_avaliacao(tmp, "teste_congelado", "abc", "mlp", False)
            self.assertTrue(tm.ja_avaliado(tmp, "teste_congelado", "abc"))
            self.assertFalse(tm.ja_avaliado(tmp, "teste_congelado", "outro"))
            self.assertFalse(tm.ja_avaliado(tmp, "holdout_fresco", "abc"))

    def test_holdout_fresco_avalia_o_campeao_uma_vez(self):
        val = tm.executar_torneio(self.D, MODELOS_RAPIDOS, n_dobras=3)
        with tempfile.TemporaryDirectory() as tmp:
            tmp = Path(tmp)
            self.holdout.to_csv(tmp / "holdout.csv", index=False)
            (tmp / "campeao.json").write_text(json.dumps({"campeao": val["campeao"], "hiperparametros": {
                m: p for m, p in val["escolhas"].items()}}, default=list), encoding="utf-8")
            args = Namespace(saida=str(tmp), holdout_fresco=str(tmp / "holdout.csv"), campeao=str(tmp / "campeao.json"),
                             treino_do_holdout="treino+teste", forcar_reavaliacao=False)
            tm.main_holdout(args, self.treino, self.teste, {})
            pastas = [p.name for p in tmp.iterdir() if p.name.startswith("holdout_fresco")]
            self.assertEqual(len(pastas), 1)
            self.assertTrue((tmp / pastas[0] / "holdout.csv").exists())
            with self.assertRaises(SystemExit):  # segunda vez: recusada
                tm.main_holdout(args, self.treino, self.teste, {})

    def test_holdout_exige_o_campeao(self):
        args = Namespace(saida=".", holdout_fresco="x.csv", campeao=None, treino_do_holdout="treino", forcar_reavaliacao=False)
        with self.assertRaises(SystemExit):
            tm.main_holdout(args, self.treino, self.teste, {})

    def test_borda_da_grade_e_sinalizada(self):
        escolhas = {m: g[0] for m, g in MODELOS_RAPIDOS.items()}
        self.assertIn("arvore", tm.modelos_na_borda_da_grade(escolhas, MODELOS_RAPIDOS))
        escolhas["arvore"] = {"max_depth": 99}
        self.assertNotIn("arvore", tm.modelos_na_borda_da_grade(escolhas, MODELOS_RAPIDOS))


class IntegridadeTest(unittest.TestCase):
    """A trava aceita a v1 OU a v2 inteira; recusa dado alterado e mistura das duas."""

    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        raiz = Path(self.tmp.name)
        self.pastas = {}
        linhas = []
        for versao, prefixo in tm.PREFIXOS_VERSAO.items():
            pasta = raiz / versao
            pasta.mkdir()
            for nome in tm.ARQUIVOS_CONGELADOS:
                (pasta / nome).write_text(f"conteudo {versao} {nome}", encoding="utf-8")
                linhas.append(f"| `{prefixo}{nome}` | 10 | `{tm.sha256(pasta / nome)}` |")
            self.pastas[versao] = pasta
        self.md = raiz / "REFERENCIA.md"
        self.md.write_text("\n".join(linhas), encoding="utf-8")

    def test_aceita_cada_versao_e_diz_qual(self):
        self.assertEqual(tm.verificar_integridade(self.pastas["v1"], self.md), "v1")
        self.assertEqual(tm.verificar_integridade(self.pastas["v2"], self.md), "v2")

    def test_recusa_arquivo_alterado(self):
        (self.pastas["v2"] / "features_teste.csv").write_text("adulterado", encoding="utf-8")
        with self.assertRaises(SystemExit) as erro:
            tm.verificar_integridade(self.pastas["v2"], self.md)
        self.assertIn("FALHOU", str(erro.exception))

    def test_recusa_mistura_de_versoes(self):
        mistura = Path(self.tmp.name) / "mistura"
        mistura.mkdir()
        (mistura / "features_treino.csv").write_text((self.pastas["v1"] / "features_treino.csv").read_text(encoding="utf-8"), encoding="utf-8")
        (mistura / "features_teste.csv").write_text((self.pastas["v2"] / "features_teste.csv").read_text(encoding="utf-8"), encoding="utf-8")
        with self.assertRaises(SystemExit):
            tm.verificar_integridade(mistura, self.md)

    def test_versao_ausente_na_tabela_so_recusa_se_nenhuma_bater(self):
        so_v1 = "\n".join(l for l in self.md.read_text(encoding="utf-8").splitlines() if "v2/" not in l)
        self.md.write_text(so_v1, encoding="utf-8")
        self.assertEqual(tm.verificar_integridade(self.pastas["v1"], self.md), "v1")
        with self.assertRaises(SystemExit):
            tm.verificar_integridade(self.pastas["v2"], self.md)


if __name__ == "__main__":
    unittest.main()
