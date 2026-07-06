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
    <section
      id="inicio"
      className="relative isolate flex flex-col justify-center min-h-screen min-h-[100svh]"
    >
      {/* Background image */}
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

        {/* CTA principal + faixa de parcelamento
            (no desktop lg+ o parcelamento vira linha de texto discreta;
            mobile/tablet mantêm o pill original) */}
        <div className="mt-8 flex flex-col items-center gap-4 lg:gap-3">
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-3 rounded-xl bg-[#FFC400] text-black font-extrabold px-6 py-4
                       hover:shadow-[0_10px_25px_rgba(255,196,0,0.35)] transition
                       lg:px-8 lg:text-lg lg:shadow-[0_8px_20px_rgba(255,196,0,0.25)]"
            aria-label="Pedir pelo WhatsApp"
          >
            <MessageCircle className="w-5 h-5" />
            Pedir pelo WhatsApp
          </a>

          <div
            className="inline-flex items-center gap-3 rounded-full bg-[#FFC400] text-black/90 px-6 py-3
                       text-base md:text-lg
                       lg:bg-transparent lg:px-0 lg:py-0 lg:gap-2 lg:text-sm lg:text-white/70"
          >
            <CreditCard className="w-5 h-5 lg:w-4 lg:h-4 lg:text-[#FFC400]" />
            Parcelamos sua bateria em até 10x no cartão de crédito
          </div>
        </div>

        {/* Selos/pílulas (menores e mais discretos no desktop) */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4 lg:gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FFC400] bg-black/30 px-5 py-3 text-white lg:border-[#FFC400]/50 lg:bg-black/20 lg:px-4 lg:py-2 lg:text-sm">
            <CheckCircle className="w-5 h-5 text-[#FFC400] lg:w-4 lg:h-4" />
            <span className="font-semibold lg:font-medium">Teste de carga</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FFC400] bg-black/30 px-5 py-3 text-white lg:border-[#FFC400]/50 lg:bg-black/20 lg:px-4 lg:py-2 lg:text-sm">
            <Shield className="w-5 h-5 text-[#FFC400] lg:w-4 lg:h-4" />
            <span className="font-semibold lg:font-medium">Garantia</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FFC400] bg-black/30 px-5 py-3 text-white lg:border-[#FFC400]/50 lg:bg-black/20 lg:px-4 lg:py-2 lg:text-sm">
            <Clock className="w-5 h-5 text-[#FFC400] lg:w-4 lg:h-4" />
            <span className="font-semibold lg:font-medium">Atendimento 24h</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;

