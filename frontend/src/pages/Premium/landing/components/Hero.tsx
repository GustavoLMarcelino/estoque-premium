// frontend/src/premium-site/components/Hero.tsx
import { WHATSAPP_URL } from "@/pages/Premium/landing/constants/contact";
import heroImage from "@/pages/Premium/landing/assets/hero-workshop.jpg";
import {
  MessageCircle,
  CreditCard,
  CheckCircle,
  Shield,
  Clock,
} from "lucide-react";

const Hero = () => {
  return (
    <section id="inicio" className="relative isolate">
      {/* BG + overlay escura */}
      <div
        className="absolute inset-0 -z-10 bg-center bg-cover"
        style={{ backgroundImage: `url(${heroImage})` }}
      />
      <div className="absolute inset-0 -z-10 bg-black/70" />

      {/* Conteúdo */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32 lg:py-40 text-center">
        {/* Título grande: branco + amarelo */}
        <h1 className="text-white font-extrabold leading-[1.05] text-4xl md:text-6xl lg:text-7xl">
          Ficou sem partida?
          <br />
          <span className="text-[#FFC400]">A Premium vai até você.</span>
        </h1>

        {/* Subtítulo */}
        <p className="mt-6 text-lg md:text-2xl text-white/90">
          Entrega rápida e instalação especializada em{" "}
          <span className="font-semibold text-white">Barra Velha e região.</span>
        </p>

        {/* CTA principal + faixa de parcelamento */}
        <div className="mt-8 flex flex-col items-center gap-4">
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-3 rounded-xl bg-[#FFC400] text-black font-extrabold px-6 py-4
                       hover:shadow-[0_10px_25px_rgba(255,196,0,0.35)] transition"
            aria-label="Pedir pelo WhatsApp"
          >
            <MessageCircle className="w-5 h-5" />
            Pedir pelo WhatsApp
          </a>

          <div
            className="inline-flex items-center gap-3 rounded-full bg-[#FFC400] text-black/90 px-6 py-3
                       text-base md:text-lg"
          >
            <CreditCard className="w-5 h-5" />
            Parcelamos sua bateria em até 10x no cartão de crédito
          </div>
        </div>

        {/* Selos/pílulas */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FFC400] bg-black/30 px-5 py-3 text-white">
            <CheckCircle className="w-5 h-5 text-[#FFC400]" />
            <span className="font-semibold">Teste de carga</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FFC400] bg-black/30 px-5 py-3 text-white">
            <Shield className="w-5 h-5 text-[#FFC400]" />
            <span className="font-semibold">Garantia</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FFC400] bg-black/30 px-5 py-3 text-white">
            <Clock className="w-5 h-5 text-[#FFC400]" />
            <span className="font-semibold">Atendimento 24h</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;

