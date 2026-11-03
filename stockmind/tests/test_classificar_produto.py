import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))

from classificar_produto import (  # noqa: E402
    chave_grupo,
    chave_grossa,
    classificar_produto,
    nome_grupo,
    polaridade_assumida,
)

# (nome completo, categoria, amperagem, tecnologia, polaridade, caixa) — conferido
# linha a linha pelo dono do negócio na tabela SKU -> grupo.
CASOS = [
    ("Acdelco ADR60HD 60AH", "carro", 60.0, "Convencional", "normal", "Normal"),
    ("Eletran 60APD Advanced 60AH", "carro", 60.0, "Convencional", "normal", "Normal"),
    ("Eletran 60APE Advanced inv 60AH", "carro", 60.0, "Convencional", "invertida", "Normal"),
    ("Eletran 60PDUT CA Ultra 60AH", "carro", 60.0, "Convencional", "normal", "Normal"),
    ("Real 21D FREE 60AH", "carro", 60.0, "Convencional", "normal", "Normal"),
    ("Piobate F60DN 60AH", "carro", 60.0, "Convencional", "normal", "Normal"),
    ("Júpiter 60LE 60AH Inv", "carro", 60.0, "Convencional", "invertida", "Normal"),
    ("Acdelco ADR100LE 100AH", "caminhao", 100.0, "Convencional", "invertida", "Normal"),
    ("Júpiter JJF105FE 105AH", "caminhao", 105.0, "Convencional", "invertida", "Normal"),
    ("Júpiter JJF90HE 90AH", "carro", 90.0, "Convencional", "invertida", "Normal"),
    ("Júpiter JJF90HD 90AH", "carro", 90.0, "Convencional", "normal", "Normal"),
    ("Acdelco ADR75LE Alt Inv 75AH", "carro", 75.0, "Convencional", "invertida", "Alta"),
    ("Acdelco ADS75PD Bx 75AH", "carro", 75.0, "Convencional", "normal", "Baixa"),
    ("Acdelco ADR50JE Civic Inv 50AH", "carro", 50.0, "Convencional", "invertida", "Civic"),
    ("Acdelco ADR38JD Fit 38AH", "carro", 38.0, "Convencional", "normal", "Fit"),
    ("Acdelco ADG60HD AGM 60AH", "carro", 60.0, "AGM", "normal", "Normal"),
    ("Acdelco ADF60HD EFB 60AH", "carro", 60.0, "EFB", "normal", "Normal"),
    ("Pioneiro MBR12L-VP 12AH", "moto", 12.0, "Convencional", "normal", "Normal"),
    ("Heliar HE6D 6AH", "moto", 6.0, "Convencional", "normal", "Normal"),
    ("DF700 50AH", "estacionaria", 50.0, "Convencional", "normal", "Normal"),
    ("Júpiter JJ180FHE Inv 180AH", "caminhao", 180.0, "Convencional", "invertida", "Normal"),
]


class ClassificarProdutoTest(unittest.TestCase):
    def test_casos_conferidos_na_tabela(self):
        for nome, categoria, amp, tecnologia, polaridade, caixa in CASOS:
            with self.subTest(nome=nome):
                self.assertEqual(
                    classificar_produto(nome),
                    {
                        "categoria": categoria,
                        "amperagem": amp,
                        "tecnologia": tecnologia,
                        "polaridade": polaridade,
                        "caixa": caixa,
                    },
                )

    def test_invertida_nunca_cai_no_grupo_da_normal(self):
        normal = chave_grupo(classificar_produto("Acdelco ADR60HD 60AH"))
        invertida = chave_grupo(classificar_produto("Eletran 60APE Advanced inv 60AH"))
        self.assertNotEqual(normal, invertida)
        # mas as duas compartilham a chave grossa, que é onde a demanda é prevista
        self.assertEqual(
            chave_grossa(classificar_produto("Acdelco ADR60HD 60AH")),
            chave_grossa(classificar_produto("Eletran 60APE Advanced inv 60AH")),
        )

    def test_fit_38_e_40_formam_um_grupo_so(self):
        g38 = chave_grupo(classificar_produto("Acdelco ADR38JD Fit 38AH"))
        g40 = chave_grupo(classificar_produto("Heliar H40JD Fit 40AH"))
        self.assertEqual(g38, g40)
        self.assertEqual(nome_grupo(g38), "38-40AH Convencional Carro · Caixa Fit")

    def test_fit_nao_se_mistura_com_caixa_normal_nem_outras_amperagens(self):
        fit = chave_grupo(classificar_produto("Heliar H40JD Fit 40AH"))
        normal_40 = chave_grupo(classificar_produto("Fulano F40JD 40AH"))
        self.assertNotEqual(fit, normal_40)
        fit_50 = chave_grupo(classificar_produto("Fulano F50JD Fit 50AH"))
        self.assertNotEqual(fit, fit_50)

    def test_civic_e_grupo_proprio(self):
        civic = chave_grupo(classificar_produto("Acdelco ADR50JD Civic 50AH"))
        normal = chave_grupo(classificar_produto("Acdelco ADR50GD 50AH"))
        self.assertNotEqual(civic, normal)

    def test_sem_amperagem_nao_tem_grupo(self):
        self.assertIsNone(classificar_produto("Terminal Bateria"))

    def test_excel_usa_categoria_e_amperagem_das_colunas(self):
        c = classificar_produto("JUPITER JJF60LE 60AH INV", categoria_base="carro", amperagem=60.0)
        self.assertEqual((c["polaridade"], c["categoria"]), ("invertida", "carro"))
        # amperagem NaN na planilha cai para a do nome
        c = classificar_produto("ELETRAN 60AH 24M", categoria_base="carro", amperagem=float("nan"))
        self.assertEqual((c["amperagem"], c["polaridade"]), (60.0, "normal"))

    def test_prazo_de_garantia_no_nome_nao_e_confundido_com_codigo(self):
        # "24M"/"12 M" terminam em M e "60AH" em H — nenhum pode virar polaridade
        self.assertEqual(classificar_produto("PIOBAT F60DN 60AH 12 M")["polaridade"], "normal")
        self.assertEqual(classificar_produto("ELETRAN 60AH 24M")["polaridade"], "normal")

    def test_aviso_de_polaridade_assumida(self):
        # código não termina em D/E: polaridade normal é suposição -> avisa
        self.assertTrue(polaridade_assumida("Piobate F60DN 60AH", "carro"))
        self.assertTrue(polaridade_assumida("Pioneiro F60DG 60AH", "carro"))
        # leu D/E ou o token Inv: não é suposição
        self.assertFalse(polaridade_assumida("Acdelco ADR60HD 60AH", "carro"))
        self.assertFalse(polaridade_assumida("Real 21D FREE 60AH", "carro"))
        self.assertFalse(polaridade_assumida("Eletran 60APE Advanced inv 60AH", "carro"))
        # moto/estacionária: regra aprovada (sempre normal), sem aviso
        self.assertFalse(polaridade_assumida("Pioneiro MBR12L-VP 12AH", "moto"))


if __name__ == "__main__":
    unittest.main()
