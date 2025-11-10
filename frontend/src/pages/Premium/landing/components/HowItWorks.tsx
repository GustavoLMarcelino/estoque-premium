// Seção "Como funciona" (igual ao print): fundo claro, títulos escuros,
// cards com borda preta sutil e ícone dentro de círculo com aro amarelo.
import React from "react";
import { MessageCircle, Truck, Wrench } from "lucide-react";

type Step = {
  icon: React.ReactNode;
  title: string;
  desc: string;
};

const steps: Step[] = [
  {
    icon: <MessageCircle className="w-7 h-7 text-black" />,
    title: "Chame no WhatsApp",
    desc:
      "Entre em contato e informe seu modelo de veículo e localização.",
  },
  {
    icon: <Truck className="w-7 h-7 text-black" />,
    title: "Vamos até você",
    desc:
      "Nossa equipe chega rápido com a bateria ideal para seu carro.",
  },
  {
    icon: <Wrench className="w-7 h-7 text-black" />,
    title: "Instalação e testes",
    desc:
      "Instalamos, testamos o alternador e garantimos que tudo funcione perfeitamente.",
  },
];

export default function HowItWorks() {
  return (
    <section id="instalacao" className="bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
        {/* Título e subtítulo (pretos como no print) */}
        <h2 className="text-3xl md:text-5xl font-extrabold text-black text-center">
          Como funciona
        </h2>
        <p className="mt-3 text-center text-black/60">
          Processo simples e rápido para você voltar a rodar
        </p>

        {/* Cards */}
        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
          {steps.map((s, i) => (
            <article
              key={i}
              className="rounded-xl border border-black/25 bg-white p-8 text-center shadow-[0_1px_0_rgba(0,0,0,0.04)] hover:shadow-lg transition"
            >
              {/* Círculo com aro amarelo */}
              <div className="mx-auto mb-6 flex items-center justify-center h-20 w-20 rounded-full bg-white border-[3px] border-[#FFC400]">
                {s.icon}
              </div>

              <h3 className="text-xl font-extrabold text-black">
                {s.title}
              </h3>
              <p className="mt-3 text-black/70 leading-relaxed">
                {s.desc}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
