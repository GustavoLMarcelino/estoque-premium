// Coverage.tsx — location pills with amber hover + MapPin bounce
import React from "react";
import { MapPin } from "lucide-react";
import { WHATSAPP_NUMBER } from "@/pages/Premium/landing/constants/contact";

const AREAS = [
  "Barra Velha Centro",
  "Itajuba",
  "São Cristóvão",
  "Tabuleiro",
  "Piçarras",
  "São João do Itaperiú",
];

function whatsappLink(area: string) {
  const msg = encodeURIComponent(`Olá! Estou em ${area} e preciso de uma bateria.`);
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
}

export default function Coverage() {
  return (
    <section id="cobertura" className="bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-14 md:py-20">
        <h2 className="text-3xl md:text-5xl font-extrabold text-black text-center">
          Atendemos Barra Velha e região
        </h2>
        <p className="mt-3 text-center text-black/60">
          Cobertura completa para garantir que você não fique na mão
        </p>

        <div className="mt-10 rounded-2xl border border-[#FFC400] bg-[#F4F4F4] p-8 md:p-10">
          {/* Pin central with bounce on hover */}
          <div className="flex justify-center">
            <div className="group h-16 w-16 rounded-full bg-[#FFC400] flex items-center justify-center shadow">
              <MapPin
                className="w-8 h-8 text-black transition-transform duration-300 group-hover:scale-110"
                style={{ animation: "bounce-pin 2s ease-in-out infinite" }}
              />
            </div>
          </div>

          {/* Pills */}
          <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {AREAS.map((area) => (
              <a
                key={area}
                href={whatsappLink(area)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center justify-center rounded-xl bg-white text-black
                           font-semibold py-3 px-4 border border-black/10 shadow-sm
                           transition-all duration-200
                           hover:bg-[#FFC400] hover:text-black hover:border-[#FFC400] hover:shadow-md hover:scale-[1.02]"
                aria-label={`Chamar no WhatsApp sobre ${area}`}
              >
                {area}
              </a>
            ))}
          </div>

          <p className="mt-6 text-center text-black/50 text-sm">
            * Não encontrou sua localização? Entre em contato para consultar disponibilidade.
          </p>
        </div>
      </div>
    </section>
  );
}
