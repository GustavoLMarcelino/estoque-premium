// Testimonials.tsx — filled stars, card hover, mobile carousel
import React, { useState } from "react";
import { Star, Quote, ChevronLeft, ChevronRight } from "lucide-react";

type Depoimento = {
  nome: string;
  bairro: string;
  texto: string;
  rating?: number;
};

const items: Depoimento[] = [
  {
    nome: "Carlos Silva",
    bairro: "Barra Velha Centro",
    texto: '"Atendimento rápido e profissional. Vieram até minha casa e resolveram em 30 minutos!"',
    rating: 5,
  },
  {
    nome: "Maria Santos",
    bairro: "Itajuba",
    texto: '"Preço justo e parcelamento facilitado. A bateria já está funcionando perfeitamente há 6 meses."',
    rating: 5,
  },
  {
    nome: "João Oliveira",
    bairro: "Piçarras",
    texto: '"Fiquei impressionado com a agilidade. Liguei de manhã e à tarde já estava tudo resolvido."',
    rating: 5,
  },
];

function Stars({ n = 5 }: { n?: number }) {
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={`h-5 w-5 ${i < n ? "text-[#FFC400] fill-[#FFC400]" : "text-black/20"}`}
          strokeWidth={1.5}
        />
      ))}
      <span className="sr-only">{n} de 5</span>
    </div>
  );
}

function Card({ d }: { d: Depoimento }) {
  return (
    <article className="relative rounded-2xl border border-black/15 bg-white p-6 md:p-8 shadow-sm
                        transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:border-[#FFC400]/40">
      <Quote className="absolute right-6 top-6 h-8 w-8 text-[#FFC400]/40" />
      <Stars n={d.rating ?? 5} />
      <p className="mt-4 text-black/80 leading-relaxed">{d.texto}</p>
      <div className="mt-6 border-t border-black/10" />
      <div className="mt-4">
        <div className="font-extrabold text-black">{d.nome}</div>
        <div className="text-black/60 text-sm">{d.bairro}</div>
      </div>
    </article>
  );
}

export default function Testimonials() {
  const [active, setActive] = useState(0);

  const prev = () => setActive((i) => (i - 1 + items.length) % items.length);
  const next = () => setActive((i) => (i + 1) % items.length);

  return (
    <section className="bg-[#F6F6F6]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
        <h2 className="text-3xl md:text-5xl font-extrabold text-black text-center">
          O que dizem nossos clientes
        </h2>
        <p className="mt-3 text-center text-black/60">
          Confiança e qualidade comprovadas
        </p>

        {/* Desktop grid */}
        <div className="hidden md:grid mt-10 grid-cols-3 gap-6 md:gap-8">
          {items.map((d, idx) => <Card key={idx} d={d} />)}
        </div>

        {/* Mobile carousel */}
        <div className="md:hidden mt-10">
          <Card d={items[active]} />

          <div className="mt-6 flex items-center justify-center gap-4">
            <button
              onClick={prev}
              aria-label="Anterior"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-black/20 bg-white text-black hover:border-[#FFC400] hover:text-[#FFC400] transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div className="flex gap-2">
              {items.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActive(i)}
                  aria-label={`Depoimento ${i + 1}`}
                  className={`h-2 rounded-full transition-all duration-300 ${
                    i === active ? "w-6 bg-[#FFC400]" : "w-2 bg-black/20"
                  }`}
                />
              ))}
            </div>

            <button
              onClick={next}
              aria-label="Próximo"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-black/20 bg-white text-black hover:border-[#FFC400] hover:text-[#FFC400] transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
