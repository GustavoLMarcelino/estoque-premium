import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from classificar_produto import classificar_produto  # noqa: E402
from reposicao import (  # noqa: E402
    calcular_reposicao,
    distribuir_por_participacao,
    montar_grupos,
    repartir_demanda,
)

GROSSA_60 = ("carro", 60.0, "Convencional")
SUB_60_NORMAL = GROSSA_60 + ("normal", "Normal")
SUB_60_INV = GROSSA_60 + ("invertida", "Normal")
GRUPO_60_NORMAL = ("carro", "60", "Convencional", "normal", "Normal")
GRUPO_60_INV = ("carro", "60", "Convencional", "invertida", "Normal")


def sku(id, produto, estoque, minimo, vendas6m=0):
    return {"id": id, "produto": produto, "marca": "X", "estoque": estoque, "minimo": minimo,
            "classe": classificar_produto(produto), "vendas6m": vendas6m, "ultimaVenda": None}


class CalcularReposicaoTest(unittest.TestCase):
    def test_formula_comprar_e_cobertura(self):
        # demanda 30, segurança 10, estoque 5: necessidade 40 -> comprar 35; cobertura 5 dias
        r = calcular_reposicao(estoque=5, seguranca=10, demanda=30)
        self.assertEqual((r["quantidadeSugerida"], r["coberturaDias"], r["prioridade"]), (35, 5.0, "alta"))
        self.assertEqual(r["acao"], "Comprar 35 un")

    def test_estoque_do_grupo_acima_da_necessidade_nao_compra(self):
        r = calcular_reposicao(estoque=222, seguranca=60, demanda=34)
        self.assertEqual((r["quantidadeSugerida"], r["prioridade"], r["acao"]), (0, "baixa", "Estoque suficiente"))

    def test_limites_de_prioridade_pela_cobertura(self):
        # demanda 30/mês = 1/dia: cobertura em dias == estoque
        self.assertEqual(calcular_reposicao(9, 0, 30)["prioridade"], "alta")
        self.assertEqual(calcular_reposicao(10, 0, 30)["prioridade"], "media")
        self.assertEqual(calcular_reposicao(20, 0, 30)["prioridade"], "media")
        self.assertEqual(calcular_reposicao(21, 0, 30)["prioridade"], "baixa")

    def test_quantidade_arredonda_para_cima(self):
        self.assertEqual(calcular_reposicao(0, 0, 3.2)["quantidadeSugerida"], 4)

    def test_sem_giro_abaixo_do_minimo_repoe_minimo_e_nunca_e_alta(self):
        r = calcular_reposicao(estoque=0, seguranca=1, demanda=0)
        self.assertEqual((r["acao"], r["quantidadeSugerida"], r["prioridade"]), ("Repor mínimo (1 un)", 1, "media"))
        r = calcular_reposicao(estoque=2, seguranca=5, demanda=0.2)
        self.assertEqual((r["acao"], r["prioridade"]), ("Repor mínimo (3 un)", "baixa"))

    def test_sem_giro_com_estoque_ok_manda_avaliar_no_mix(self):
        r = calcular_reposicao(estoque=3, seguranca=2, demanda=0)
        self.assertEqual((r["acao"], r["quantidadeSugerida"], r["prioridade"]), ("Sem giro: avaliar no mix", 0, "baixa"))

    def test_sem_previsao_nao_inventa_demanda(self):
        r = calcular_reposicao(estoque=3, seguranca=2, demanda=None)
        self.assertEqual((r["acao"], r["quantidadeSugerida"]), ("Sem previsão: avaliar no mix", 0))

    def test_nunca_alta_com_quantidade_zero(self):
        for estoque in range(0, 40):
            for seguranca in (0, 1, 5):
                for demanda in (None, 0, 0.4, 0.5, 3, 34):
                    r = calcular_reposicao(estoque, seguranca, demanda)
                    if r["prioridade"] == "alta":
                        self.assertGreater(r["quantidadeSugerida"], 0, (estoque, seguranca, demanda))


class RepartirDemandaTest(unittest.TestCase):
    def test_reparte_pela_janela_recente(self):
        d, base = repartir_demanda({GROSSA_60: 40.0}, [SUB_60_NORMAL, SUB_60_INV], {SUB_60_NORMAL: 30, SUB_60_INV: 10}, {})
        self.assertAlmostEqual(d[GRUPO_60_NORMAL], 30.0)
        self.assertAlmostEqual(d[GRUPO_60_INV], 10.0)

    def test_janela_zerada_usa_historico_inteiro_e_depois_divide_igual(self):
        ativos = [SUB_60_NORMAL, SUB_60_INV]
        d, base = repartir_demanda({GROSSA_60: 10.0}, ativos, {}, {SUB_60_NORMAL: 9, SUB_60_INV: 1})
        self.assertAlmostEqual(d[GRUPO_60_INV], 1.0)
        self.assertEqual(base[GRUPO_60_INV], "historico")
        d, base = repartir_demanda({GROSSA_60: 10.0}, ativos, {}, {})
        self.assertAlmostEqual(d[GRUPO_60_INV], 5.0)
        self.assertEqual(base[GRUPO_60_INV], "igual")

    def test_com_venda_na_janela_a_base_e_a_janela(self):
        _, base = repartir_demanda({GROSSA_60: 10.0}, [SUB_60_NORMAL], {SUB_60_NORMAL: 4}, {SUB_60_NORMAL: 99})
        self.assertEqual(base[GRUPO_60_NORMAL], "janela")

    def test_sku_cadastrado_com_estoque_zero_recebe_a_fatia_da_demanda(self):
        # a invertida está em ruptura (estoque 0): é quem mais precisa da sugestão
        skus = [sku(1, "Acdelco ADR60HD 60AH", 50, 5), sku(2, "Eletran 60APE Advanced inv 60AH", 0, 2)]
        grupos, _ = montar_grupos(skus, {GROSSA_60: 40.0}, {GROSSA_60: "alta"},
                                  {SUB_60_NORMAL: 30, SUB_60_INV: 10}, {})
        inv = {g["grupo"]: g for g in grupos}["60AH Convencional Carro · Invertida"]
        self.assertAlmostEqual(inv["demandaPrevista30d"], 10.0)
        self.assertEqual((inv["quantidadeSugerida"], inv["prioridade"]), (12, "alta"))

    def test_subgrupo_inativo_nao_leva_demanda(self):
        # a invertida vendeu 10, mas não há SKU ativo dela: a normal fica só com a sua fatia
        d, base = repartir_demanda({GROSSA_60: 20.0}, [SUB_60_NORMAL], {SUB_60_NORMAL: 10, SUB_60_INV: 10}, {})
        self.assertAlmostEqual(d[GRUPO_60_NORMAL], 10.0)

    def test_sem_previsao_continua_none(self):
        d, base = repartir_demanda({GROSSA_60: None}, [SUB_60_NORMAL], {SUB_60_NORMAL: 5}, {})
        self.assertIsNone(d[GRUPO_60_NORMAL])


class DistribuirTest(unittest.TestCase):
    def test_soma_exata_pelo_maior_resto(self):
        self.assertEqual(distribuir_por_participacao(10, {1: 5, 2: 3, 3: 2}), {1: 5, 2: 3, 3: 2})
        self.assertEqual(sum(distribuir_por_participacao(5, {1: 1, 2: 1, 3: 1}).values()), 5)

    def test_sem_vendas_nao_sugere_distribuicao(self):
        self.assertEqual(distribuir_por_participacao(5, {1: 0, 2: 0}), {})


class MontarGruposTest(unittest.TestCase):
    def test_estoque_e_minimo_do_grupo_somam_os_skus_e_invertida_fica_separada(self):
        skus = [
            sku(1, "Acdelco ADR60HD 60AH", 8, 3, vendas6m=10),
            sku(2, "ONBAT F60DN 60AH", 52, 10, vendas6m=30),
            sku(3, "Eletran 60APE Advanced inv 60AH", 1, 1, vendas6m=2),
        ]
        grupos, _ = montar_grupos(skus, {GROSSA_60: 34.0}, {GROSSA_60: "alta"},
                                  {SUB_60_NORMAL: 40, SUB_60_INV: 2}, {})
        por_nome = {g["grupo"]: g for g in grupos}
        normal = por_nome["60AH Convencional Carro"]
        self.assertEqual((normal["estoqueAtual"], normal["estoqueSeguranca"]), (60, 13))
        self.assertEqual(len(normal["skus"]), 2)
        self.assertEqual(por_nome["60AH Convencional Carro · Invertida"]["estoqueAtual"], 1)

    def test_demanda_por_categoria_soma_grupos_sem_duplicar_por_sku(self):
        skus = [sku(i, f"Marca{i} X60HD 60AH", 5, 1) for i in range(10)]
        grupos, por_categoria = montar_grupos(skus, {GROSSA_60: 34.0}, {GROSSA_60: "alta"}, {}, {})
        self.assertEqual(len(grupos), 1)
        self.assertEqual(por_categoria, [{"categoria": "Carro", "demanda": 34.0}])

    def test_participacao_e_distribuicao_por_sku(self):
        skus = [sku(1, "A A60HD 60AH", 0, 0, vendas6m=30), sku(2, "B B60HD 60AH", 0, 0, vendas6m=10)]
        grupos, _ = montar_grupos(skus, {GROSSA_60: 40.0}, {GROSSA_60: "alta"}, {SUB_60_NORMAL: 40}, {})
        g = grupos[0]
        self.assertEqual(g["quantidadeSugerida"], 40)
        porid = {s["id"]: s for s in g["skus"]}
        self.assertEqual(porid[1]["participacao"], 0.75)
        self.assertEqual((porid[1]["distribuicaoSugerida"], porid[2]["distribuicaoSugerida"]), (30, 10))

    def test_fit_38_e_40_viram_um_grupo_com_a_demanda_somada(self):
        g38, g40 = ("carro", 38.0, "Convencional"), ("carro", 40.0, "Convencional")
        skus = [sku(1, "Acdelco ADR38JD Fit 38AH", 0, 0), sku(2, "Heliar H40JD Fit 40AH", 0, 0)]
        grupos, _ = montar_grupos(skus, {g38: 3.0, g40: 2.0}, {g38: "alta", g40: "media"}, {}, {})
        self.assertEqual(len(grupos), 1)
        self.assertEqual(grupos[0]["demandaPrevista30d"], 5.0)
        self.assertEqual(grupos[0]["confianca"], "media")  # a pior das duas

    def test_justificativa_registra_o_fallback_para_o_historico(self):
        skus = [sku(1, "A A60HD 60AH", 5, 1)]
        com_janela, _ = montar_grupos(skus, {GROSSA_60: 34.0}, {GROSSA_60: "alta"}, {SUB_60_NORMAL: 5}, {})
        self.assertNotIn("Sem vendas", com_janela[0]["justificativa"])
        historico, _ = montar_grupos(skus, {GROSSA_60: 34.0}, {GROSSA_60: "alta"}, {}, {SUB_60_NORMAL: 5})
        self.assertIn("pelo histórico completo de vendas, inclusive o do Excel", historico[0]["justificativa"])
        igual, _ = montar_grupos(skus, {GROSSA_60: 34.0}, {GROSSA_60: "alta"}, {}, {})
        self.assertIn("dividida igualmente", igual[0]["justificativa"])

    def test_grupo_herda_a_probabilidade_do_grosso_e_none_sem_previsao(self):
        skus = [sku(1, "A A60HD 60AH", 5, 1)]
        g, _ = montar_grupos(skus, {GROSSA_60: 3.0}, {GROSSA_60: "alta"}, {}, {}, {GROSSA_60: 0.8123})
        self.assertEqual(g[0]["probabilidadeVenda"], 0.812)
        g, _ = montar_grupos(skus, {GROSSA_60: None}, {GROSSA_60: "baixa"}, {}, {}, {GROSSA_60: None})
        self.assertIsNone(g[0]["probabilidadeVenda"])

    def test_giro_e_por_grupo(self):
        # 10 SKUs no mesmo grupo não viram 10 "alto giro"
        skus = [sku(i, f"Marca{i} X60HD 60AH", 5, 1) for i in range(10)]
        grupos, _ = montar_grupos(skus, {GROSSA_60: 34.0}, {GROSSA_60: "alta"}, {}, {})
        self.assertEqual(sum(1 for g in grupos if g["giro"] == "alto"), 1)


if __name__ == "__main__":
    unittest.main()
