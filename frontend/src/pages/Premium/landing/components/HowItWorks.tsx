// Seção "Como funciona" com step numbers, conector e hover effects
import React from "react";
import { MessageCircle, Truck, Wrench } from "lucide-react";

type Step = {
  number: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
};

const steps: Step[] = [
  {
    number: "01",
    icon: <MessageCircle className="w-7 h-7 text-black" />,
    title: "Chame no WhatsApp",
    desc: "Entre em contato e informe seu modelo de veículo e localização.",
  },
  {
    number: "02",
    icon: <Truck className="w-7 h-7 text-black" />,
    title: "Vamos até você",
    desc: "Nossa equipe chega rápido com a bateria ideal para seu carro.",
  },
  {
    number: "03",
    icon: <Wrench className="w-7 h-7 text-black" />,
    title: "Instalação e testes",
    desc: "Instalamos, testamos o alternador e garantimos que tudo funcione perfeitamente.",
  },
];

export default function HowItWorks() {
  return (
    <section id="instalacao" className="bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
        <h2 className="text-3xl md:text-5xl font-extrabold text-black text-center">
          Como funciona
        </h2>
        <p className="mt-3 text-center text-black/60">
          Processo simples e rápido para você voltar a rodar
        </p>

        {/* Cards with dashed connector on desktop */}
        <div className="mt-10 relative">
          {/* Dashed line connector — desktop only */}
          <div
            aria-hidden
            className="hidden md:block absolute top-[3.75rem] left-[calc(16.67%+2.5rem)] right-[calc(16.67%+2.5rem)] border-t-2 border-dashed border-[#FFC400]/35 z-0"
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8 relative z-10">
            {steps.map((s) => (
              <article
                key={s.number}
                className="rounded-xl border border-black/15 bg-white p-8 text-center shadow-sm
                           transition-all duration-300 hover:-translate-y-1
                           hover:border-[#FFC400] hover:shadow-[0_0_24px_rgba(255,196,0,0.18)]"
              >
                {/* Step number */}
                <div className="text-5xl font-black text-[#FFC400]/25 leading-none mb-4 select-none">
                  {s.number}
                </div>

                {/* Icon circle */}
                <div className="mx-auto mb-6 flex items-center justify-center h-20 w-20 rounded-full bg-white border-[3px] border-[#FFC400]">
                  {s.icon}
                </div>

                <h3 className="text-xl font-extrabold text-black">{s.title}</h3>
                <p className="mt-3 text-black/70 leading-relaxed">{s.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
