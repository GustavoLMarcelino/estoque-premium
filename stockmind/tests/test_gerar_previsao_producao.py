import contextlib
import io
import sys
import unittest
from pathlib import Path
from unittest import mock

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import gerar_previsao_producao as gpp  # noqa: E402
from classificar_produto import chave_subgrupo, classificar_produto  # noqa: E402

TS = pd.Timestamp
AGORA = TS("2026-11-03", tz="UTC").to_pydatetime()


class ModeloStub:
    """Regressão que devolve o próprio mm3: a demanda prevista do grupo grosso
    revela exatamente que histórico entrou na média."""

    def predict(self, X):
        return X["mm3"].to_numpy()

    def predict_proba(self, X):
        return np.column_stack([np.zeros(len(X)), np.ones(len(X))])


def historico_excel(meses_ate_out):
    """60AH normal: 30 un/mês de 2025-10 a 2026-09; outubro/2026 = 50 (Excel cobrindo a lacuna)."""
    linhas = [
        {"categoria": "carro", "amperagem": 60.0, "tecnologia": "Convencional", "polaridade": "normal",
         "caixa": "Normal", "mes": m, "quantidade": 30.0}
        for m in pd.date_range("2025-10-01", "2026-09-01", freq="MS")
    ]
    linhas.append({"categoria": "carro", "amperagem": 60.0, "tecnologia": "Convencional", "polaridade": "normal",
                   "caixa": "Normal", "mes": TS("2026-10-01"), "quantidade": meses_ate_out})
    return pd.DataFrame(linhas)


PRODUTOS = pd.DataFrame([{"id": 1, "produto": "Acdelco ADR60HD", "modelo": "60AH", "qtd_minima": 2, "em_estoque": 10,
                          "qtd_inicial": 0, "entradas": 0, "saidas": 0, "marca": "Acdelco"}])


class SemContagemEmDobroTest(unittest.TestCase):
    def demanda_60ah(self, excel_fim, movimentos):
        excel = (historico_excel(50.0), TS("2023-05-04"), TS(excel_fim))
        with mock.patch.object(gpp, "carregar_historico_excel", return_value=excel), \
                mock.patch.object(gpp, "carregar_ultimas_vendas_excel", return_value=({}, {})), \
                mock.patch.object(gpp.joblib, "load", return_value=ModeloStub()), \
                contextlib.redirect_stdout(io.StringIO()):
            payload, _ = gpp.gerar_payload(PRODUTOS, movimentos, AGORA, TS("2026-10-09 14:39"))
        return payload["grupos"][0]["demandaPrevista30d"]

    def test_venda_de_producao_dentro_da_cobertura_do_excel_nao_conta_duas_vezes(self):
        # Excel vai até 20/10 e já tem 50 un em outubro. A saída de 15/10 (20 un) é a mesma
        # venda que o Excel já cobre e é ignorada; a de 25/10 (5 un) é depois do Excel e vale.
        movimentos = pd.DataFrame({
            "produto_id": [1, 1],
            "quantidade": [20, 5],
            "data_movimentacao": [TS("2026-10-15"), TS("2026-10-25")],
        })
        # mm3 = média(ago=30, set=30, out=50+5) = 38,33 (com dobro seria (30+30+75)/3 = 45)
        self.assertAlmostEqual(self.demanda_60ah("2026-10-20", movimentos), 38.3, places=1)

    def test_com_a_lacuna_aberta_a_producao_vale_inteira(self):
        # Excel só até abril (lacuna maio a 8/10): o Excel não cobre outubro, então vale a produção
        excel = (historico_excel(0.0).iloc[:-1], TS("2023-05-04"), TS("2026-04-30"))
        movimentos = pd.DataFrame({"produto_id": [1], "quantidade": [23], "data_movimentacao": [TS("2026-10-15")]})
        with mock.patch.object(gpp, "carregar_historico_excel", return_value=excel), \
                mock.patch.object(gpp, "carregar_ultimas_vendas_excel", return_value=({}, {})), \
                mock.patch.object(gpp.joblib, "load", return_value=ModeloStub()), \
                contextlib.redirect_stdout(io.StringIO()):
            payload, _ = gpp.gerar_payload(PRODUTOS, movimentos, AGORA, TS("2026-10-09 14:39"))
        # outubro: 23 un em 23 dias cobertos (09 a 31) -> 23 * 31/23 = 31; ago/set sem dado (faltante)
        self.assertAlmostEqual(payload["grupos"][0]["demandaPrevista30d"], 31.0, places=1)


class UltimaVendaHistoricaNoJsonTest(unittest.TestCase):
    def sku_do_payload(self, por_subgrupo, por_grosso):
        excel = (historico_excel(0.0), TS("2023-05-04"), TS("2026-09-30"))
        with mock.patch.object(gpp, "carregar_historico_excel", return_value=excel),                 mock.patch.object(gpp, "carregar_ultimas_vendas_excel", return_value=(por_subgrupo, por_grosso)),                 mock.patch.object(gpp.joblib, "load", return_value=ModeloStub()),                 contextlib.redirect_stdout(io.StringIO()):
            payload, _ = gpp.gerar_payload(PRODUTOS, pd.DataFrame(columns=["produto_id", "quantidade", "data_movimentacao"]),
                                           AGORA, TS("2026-10-09 14:39"))
        return payload["grupos"][0]["skus"][0]

    def test_sku_recebe_a_data_e_o_nivel_do_historico_por_marca_e_grupo(self):
        classe = classificar_produto("Acdelco ADR60HD 60AH")
        sku = self.sku_do_payload({("ACDELCO", chave_subgrupo(classe)): TS("2026-09-30")}, {})
        self.assertEqual(sku["ultimaVendaHistorico"], "2026-09-30")
        self.assertEqual(sku["ultimaVendaHistoricoNivel"], "subgrupo")
        self.assertIsNone(sku["ultimaVenda"])  # sem venda na produção: o campo exato continua separado

    def test_sem_historico_os_campos_ficam_nulos(self):
        sku = self.sku_do_payload({}, {})
        self.assertIsNone(sku["ultimaVendaHistorico"])
        self.assertIsNone(sku["ultimaVendaHistoricoNivel"])


if __name__ == "__main__":
    unittest.main()
