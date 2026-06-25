import React from "react";
import { Battery } from "lucide-react";
import EstoqueView from "../../components/EstoqueView/EstoqueView";
import { EstoqueAPI } from "../../services/estoque";
import { MovAPI } from "../../services/movimentacoes";

export default function Estoque() {
  return (
    <EstoqueView
      title="Estoque de Baterias"
      description="Gerencie o estoque de baterias"
      icon={Battery}
      api={EstoqueAPI}
      movApi={MovAPI}
      showModelo
      lucroVariant="percent"
      linha="BATERIAS"
    />
  );
}
