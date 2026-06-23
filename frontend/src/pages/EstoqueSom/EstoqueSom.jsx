import React from "react";
import { Music } from "lucide-react";
import EstoqueView from "../../components/EstoqueView/EstoqueView";
import { EstoqueSomAPI } from "../../services/estoqueSom";
import { MovSomAPI } from "../../services/movimentacoesSom";

export default function EstoqueSom() {
  return (
    <EstoqueView
      title="Estoque Som"
      description="Gerencie o estoque de som"
      icon={Music}
      api={EstoqueSomAPI}
      movApi={MovSomAPI}
      lucroVariant="valor"
    />
  );
}
