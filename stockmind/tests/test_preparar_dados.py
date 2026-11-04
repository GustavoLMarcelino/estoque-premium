import contextlib
import io
import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

import preparar_dados  # noqa: E402


def linha(data, produto="ACDELCO ADR60HD 60AH", qtd=1, categoria="convencional"):
    return {"data": data, "produto": produto, "quantidade": qtd, "amperagem_ah": 60.0, "categoria": categoria}


class PrepararDadosTest(unittest.TestCase):
    def rodar(self, linhas):
        tmp = Path(tempfile.mkdtemp())
        pd.DataFrame(linhas).to_excel(tmp / "vendas.xlsx", sheet_name="Sheet1", index=False)
        originais = (preparar_dados.RAW_PATH, preparar_dados.PROCESSED_DIR)
        preparar_dados.RAW_PATH, preparar_dados.PROCESSED_DIR = tmp / "vendas.xlsx", tmp / "processed"
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                preparar_dados.main()
        finally:
            preparar_dados.RAW_PATH, preparar_dados.PROCESSED_DIR = originais
        return {n: pd.read_csv(tmp / "processed" / f"{n}.csv", parse_dates=["data"]) for n in ("treino", "teste", "recente")}

    def test_dados_de_maio_em_diante_vao_para_recente_e_nao_para_treino_nem_teste(self):
        csvs = self.rodar([
            linha("2025-01-10"),
            linha("2025-12-05"),
            linha("2026-04-20"),
            linha("2026-05-03"),
            linha("2026-09-15", qtd=4),
            linha("2026-09-20", produto="MBR16-LBS", categoria="descontinuado"),  # baixo volume segue excluído
        ])
        self.assertEqual(csvs["treino"]["data"].dt.strftime("%Y-%m-%d").tolist(), ["2025-01-10"])
        self.assertEqual(csvs["teste"]["data"].dt.strftime("%Y-%m-%d").tolist(), ["2025-12-05", "2026-04-20"])
        self.assertEqual(csvs["recente"]["data"].dt.strftime("%Y-%m-%d").tolist(), ["2026-05-03", "2026-09-15"])
        self.assertEqual(csvs["recente"]["quantidade"].tolist(), [1, 4])

    def test_sem_dados_novos_recente_fica_vazio_e_treino_teste_nao_mudam(self):
        csvs = self.rodar([linha("2025-01-10"), linha("2026-04-20")])
        self.assertEqual(len(csvs["recente"]), 0)
        self.assertEqual((len(csvs["treino"]), len(csvs["teste"])), (1, 1))


if __name__ == "__main__":
    unittest.main()
