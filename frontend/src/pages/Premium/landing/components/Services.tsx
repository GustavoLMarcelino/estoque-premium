// Services.tsx — Baterias e serviços com hover: amber left border + scale
import React from "react";
import { Battery, Clock, Zap, Recycle } from "lucide-react";

type Service = {
  icon: React.ReactNode;
  title: string;
  desc: string;
};

const services: Service[] = [
  {
    icon: <Battery className="w-7 h-7 text-[#FFC400]" />,
    title: "Troca e instalação",
    desc: "Substituição completa da bateria com instalação profissional no local.",
  },
  {
    icon: <Clock className="w-7 h-7 text-[#FFC400]" />,
    title: "Socorro 24h",
    desc: "Atendimento emergencial a qualquer hora, qualquer dia da semana.",
  },
  {
    icon: <Zap className="w-7 h-7 text-[#FFC400]" />,
    title: "Teste de alternador",
    desc: "Diagnóstico completo do sistema elétrico para evitar problemas futuros.",
  },
  {
    icon: <Recycle className="w-7 h-7 text-[#FFC400]" />,
    title: "Recolhimento responsável",
    desc: "Descarte ecológico da bateria antiga conforme normas ambientais.",
  },
];

export default function Services() {
  return (
    <section id="baterias" className="bg-[#F6F6F6] overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
        <h2 className="text-3xl md:text-5xl font-extrabold text-black text-center">
          Baterias e serviços
        </h2>
        <p className="mt-3 text-center text-black/60">
          Soluções completas para manter seu veículo sempre em movimento
        </p>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-8">
          {services.map((s, i) => (
            <article
              key={i}
              className="group relative overflow-hidden rounded-2xl border border-[#FFC400]/80 bg-black p-8
                         transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:shadow-black/30"
            >
              {/* Amber left border accent */}
              <span
                aria-hidden
                className="absolute inset-y-0 left-0 w-1 rounded-l-2xl bg-[#FFC400] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
              />

              <div className="flex items-start gap-5">
                <div className="flex items-center justify-center h-16 w-16 rounded-full border-2 border-[#FFC400] bg-black/30 shrink-0">
                  {s.icon}
                </div>
                <div className="text-white">
                  <h3 className="text-xl md:text-2xl font-extrabold">{s.title}</h3>
                  <p className="mt-3 text-white/80 leading-relaxed">{s.desc}</p>
                </div>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-10 text-center">
          <a
            href="#contato"
            className="inline-flex items-center rounded-xl bg-[#FFC400] text-black
                       font-extrabold px-6 py-3
                       hover:shadow-[0_10px_25px_rgba(255,196,0,0.35)] transition"
          >
            Consultar modelos
          </a>
        </div>
      </div>
    </section>
  );
}
