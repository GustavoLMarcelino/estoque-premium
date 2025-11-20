// Testimonials.tsx
// "O que dizem nossos clientes" — 3 depoimentos com estrelas e aspas.

import React from "react";
import { Star, Quote } from "lucide-react";

type Depoimento = {
  nome: string;
  bairro: string;
  texto: string;
  rating?: number; // padrão 5
};

const items: Depoimento[] = [
  {
    nome: "Carlos Silva",
    bairro: "Barra Velha Centro",
    texto:
      '“Atendimento rápido e profissional. Vieram até minha casa e resolveram em 30 minutos!”',
    rating: 5,
  },
  {
    nome: "Maria Santos",
    bairro: "Itajuba",
    texto:
      '“Preço justo e parcelamento facilitado. A bateria já está funcionando perfeitamente há 6 meses.”',
    rating: 5,
  },
  {
    nome: "João Oliveira",
    bairro: "Piçarras",
    texto:
      '“Fiquei impressionado com a agilidade. Liguei de manhã e à tarde já estava tudo resolvido.”',
    rating: 5,
  },
];

function Stars({ n = 5 }: { n?: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-5 w-5 ${
            i < n ? "text-[#FFC400]" : "text-black/20"
          }`}
          strokeWidth={2.2}
          // Lucide é “stroke-only”; colorimos via text-*
        />
      ))}
      <span className="sr-only">{n} de 5</span>
    </div>
  );
}

export default function Testimonials() {
  return (
    <section className="bg-[#F6F6F6]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
        {/* Título e subtítulo */}
        <h2 className="text-3xl md:text-5xl font-extrabold text-black text-center">
          O que dizem nossos clientes
        </h2>
        <p className="mt-3 text-center text-black/60">
          Confiança e qualidade comprovadas
        </p>

        {/* Cards */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {items.map((d, idx) => (
            <article
              key={idx}
              className="relative rounded-2xl border border-black/15 bg-white p-6 md:p-8 shadow-sm"
            >
              {/* Aspas decorativas no canto */}
              <Quote className="absolute right-6 top-6 h-8 w-8 text-[#FFC400]/40" />

              {/* Estrelas */}
              <Stars n={d.rating ?? 5} />

              {/* Texto */}
              <p className="mt-4 text-black/80 leading-relaxed">{d.texto}</p>

              {/* Divider */}
              <div className="mt-6 border-t border-black/10" />

              {/* Autor */}
              <div className="mt-4">
                <div className="font-extrabold text-black">{d.nome}</div>
                <div className="text-black/60 text-sm">{d.bairro}</div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
