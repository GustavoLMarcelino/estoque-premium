import sys
import unittest
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from classificar_produto import chave_grupo, classificar_produto, nome_grupo  # noqa: E402
from importar_livro_caixa import converter_linha_2026, juntar_livro_2026, ler_livro_markdown  # noqa: E402


class ConverterLinha2026Test(unittest.TestCase):
    def test_regras_do_dono_do_negocio(self):
        casos = [
            # (marca, livro) -> (produto, categoria, amperagem)
            ("Eletran", "60", ("ELETRAN 60AH", "convencional", 60.0)),
            ("Júpiter", "62 EFB", ("JUPITER 62AH EFB", "convencional", 62.0)),
            ("ACDelco", "60 GM", ("ACDELCO 60AH AGM", "convencional", 60.0)),  # GM = AGM
            ("ACDelco", "95 AGM", ("ACDELCO 95AH AGM BX", "convencional", 95.0)),  # 95 = caixa baixa
            ("ACDelco", "90", ("ACDELCO 90AH ALT", "convencional", 90.0)),  # 90 = caixa alta
            ("ACDelco", "75", ("ACDELCO 75AH ALT", "convencional", 75.0)),  # ADR75LD Alt
            ("ACDelco", "52", ("ACDELCO 50AH", "convencional", 50.0)),  # 50 e 52 são a mesma caixa
            ("ACDelco", "100", ("ACDELCO 100AH", "convencional", 100.0)),  # ACDelco 100 é 100 mesmo
            ("Júpiter", "45 Civic", ("JUPITER 50AH CIVIC", "convencional", 50.0)),  # Civic 45/50 = 50
            ("Júpiter", "50 Civic", ("JUPITER 50AH CIVIC", "convencional", 50.0)),
            ("Júpiter", "40 Fit", ("JUPITER 40AH FIT", "convencional", 40.0)),
            ("Júpiter", "100", ("JUPITER 105AH", "convencional", 105.0)),  # Júpiter 100 = 105
            ("Moura", "92 AGM", ("MOURA 95AH AGM", "convencional", 95.0)),
            ("Excell", "160", ("EXCELL 150AH", "convencional", 150.0)),
            ("Fênix", "50", ("FENIX 60AH", "convencional", 60.0)),  # Fênix é sempre 60
            ("Moura", "Estacionária 18", ("MOURA 18AH ESTACIONARIA", "estacionaria", 18.0)),  # jet ski
            ("Nicoll", "Estacionária 7", ("NICOLL 7AH ESTACIONARIA", "estacionaria", 7.0)),
            ("Econ", "Estacionária 1.3", ("ECON EP12 1.3AH ESTACIONARIA", "estacionaria", 1.3)),
            ("Heliar", "Freedom DF500", ("DF500", "estacionaria", 40.0)),
            ("Onbat", "60", ("ONBAT F60DN 60AH", "convencional", 60.0)),
            ("Júpiter", "90 invertida", ("JUPITER JJF90HE 90AH", "convencional", 90.0)),
            ("Júpiter", "80 invertida", ("JUPITER 80AH INV", "convencional", 80.0)),
            ("Júpiter", "80 esquerda", ("JUPITER 80AH INV", "convencional", 80.0)),
            ("Júpiter", "80 direita", ("JUPITER 80AH", "convencional", 80.0)),  # direita = normal
            ("Júpiter", "75 baixa", ("JUPITER 75AH BX", "convencional", 75.0)),
            ("MBR", "14 VP", ("MBR14-VP", "moto", 14.0)),
            ("MBR", "L9BS 9", ("MBR9-L9BS", "moto", 9.0)),
            ("MBR", "8BP", ("MBR8-BP", "moto", 8.0)),
            ("MBR", "10 BS", ("MBR10-BS", "moto", 10.0)),  # 10AH, como no cadastro
            ("MBR", "10", ("MBR10", "moto", 10.0)),
            ("Pioneiro", "MBR 7", ("MBR7", "moto", 7.0)),
            ("HTZ", "6L", ("HTZ 6AH", "moto", 6.0)),
            ("Heliar", "9", ("HELIAR 9AH", "moto", 9.0)),  # < 38AH = moto
            ("Heizer", "7", ("HEIZER 7AH", "moto", 7.0)),
        ]
        for marca, amperagem, esperado in casos:
            with self.subTest(marca=marca, amperagem=amperagem):
                self.assertEqual(converter_linha_2026(marca, amperagem), esperado)

    def test_linha_desconhecida_levanta_erro(self):
        for marca, amperagem in [("Júpiter", "abc"), ("Júpiter", "60 turbo"), ("MBR", "xyz")]:
            with self.subTest(amperagem=amperagem), self.assertRaises(ValueError):
                converter_linha_2026(marca, amperagem)

    def test_grupo_final_no_classificador(self):
        """O nome montado tem de cair no grupo certo do classificador."""
        def grupo(marca, amperagem):
            produto, categoria, amp = converter_linha_2026(marca, amperagem)
            base = {"convencional": "carro", "moto": "moto", "estacionaria": "estacionaria"}[categoria]
            return nome_grupo(chave_grupo(classificar_produto(produto, base, amp)))

        self.assertEqual(grupo("Eletran", "60"), "60AH Convencional Carro")
        self.assertEqual(grupo("Júpiter", "40 Fit"), "38-40AH Convencional Carro · Caixa Fit")
        self.assertEqual(grupo("ACDelco", "90 invertida"), "90AH Convencional Carro · Caixa Alta · Invertida")
        self.assertEqual(grupo("Júpiter", "105"), "105AH Convencional Caminhão")
        self.assertEqual(grupo("Júpiter", "90 invertida"), "90AH Convencional Carro · Invertida")
        self.assertEqual(grupo("Heliar", "Freedom DF500"), "40AH Convencional Estacionária")
        self.assertEqual(grupo("Moura", "Estacionária 18"), "18AH Convencional Estacionária")


MD = """# Título que deve ser ignorado

Texto solto, 99/99/9999,fora,do,bloco.

## Maio 2026

```csv
data,marca,amperagem,quantidade
02/05/2026,Eletran,60,1
04/05/2026,ACDelco,100,2
```

## Junho 2026

```csv
data,marca,amperagem,quantidade
01/06/2026,Júpiter,40 Fit,1
```
"""


class LerEJuntarTest(unittest.TestCase):
    def test_le_so_os_blocos_csv(self):
        livro = ler_livro_markdown(MD)
        self.assertEqual(list(livro.columns), ["data", "produto", "quantidade", "amperagem_ah", "categoria"])
        self.assertEqual(livro["data"].tolist(), ["2026-05-02", "2026-05-04", "2026-06-01"])
        self.assertEqual(livro["quantidade"].tolist(), [1, 2, 1])

    def test_cabecalho_errado_ou_sem_bloco_levanta_erro(self):
        with self.assertRaises(ValueError):
            ler_livro_markdown("```csv\nmarca,data,amperagem,quantidade\nx\n```")
        with self.assertRaises(ValueError):
            ler_livro_markdown("só texto")

    def test_linha_nao_reconhecida_interrompe(self):
        with self.assertRaises(ValueError):
            ler_livro_markdown("```csv\ndata,marca,amperagem,quantidade\n02/05/2026,Júpiter,60 turbo,1\n```")

    def test_juntar_substitui_a_planilha_a_partir_da_primeira_data_do_livro(self):
        base = pd.DataFrame(
            {
                "data": ["2026-04-30", "2026-05-02", "2026-05-06"],
                "produto": ["A", "B", "C"],
                "quantidade": [1, 1, 1],
                "amperagem_ah": [60.0, 60.0, 60.0],
                "categoria": ["convencional"] * 3,
            }
        )
        livro = ler_livro_markdown(MD)
        final, substituidas = juntar_livro_2026(base, livro)
        self.assertEqual(len(substituidas), 2)  # 02/05 e 06/05 saem da planilha
        self.assertEqual(final["data"].tolist(), ["2026-04-30", "2026-05-02", "2026-05-04", "2026-06-01"])
        self.assertNotIn("B", final["produto"].tolist())
        self.assertEqual(int(final["quantidade"].sum()), 1 + 1 + 2 + 1)  # nada somado em dobro


if __name__ == "__main__":
    unittest.main()
