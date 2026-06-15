// frontend/src/premium-site/components/Hero.tsx
import { WHATSAPP_URL } from "@/pages/Premium/landing/constants/contact";
import heroImage from "@/pages/Premium/landing/assets/hero-workshop.jpg";
import {
  MessageCircle,
  CreditCard,
  CheckCircle,
  Shield,
  Clock,
  ChevronDown,
} from "lucide-react";

const Hero = () => {
  return (
    <section id="inicio" className="relative isolate">
      {/* Background image */}
      <div
        className="absolute inset-0 -z-10 bg-center bg-cover"
        style={{ backgroundImage: `url(${heroImage})` }}
      />
      {/* Dark overlay */}
      <div className="absolute inset-0 -z-10 bg-black/70" />
      {/* Animated amber ambient glow */}
      <div
        className="absolute inset-0 -z-10 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse 80% 60% at 50% 40%, rgba(255,196,0,0.15) 0%, transparent 70%)",
          animation: "hero-pulse 4s ease-in-out infinite",
        }}
      />

      {/* Conteúdo */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 md:py-32 lg:py-40 text-center">
        {/* Título */}
        <h1 className="text-white font-extrabold leading-[1.05] text-4xl md:text-6xl lg:text-7xl">
          Ficou sem partida?
          <br />
          <span
            className="text-[#FFC400]"
            style={{ textShadow: "0 0 40px rgba(255,196,0,0.65), 0 0 80px rgba(255,196,0,0.3)" }}
          >
            A Premium vai até você.
          </span>
        </h1>

        {/* Subtítulo */}
        <p className="mt-6 text-lg md:text-2xl text-white/90">
          Entrega rápida e instalação especializada em{" "}
          <span className="font-semibold text-white">Barra Velha e região.</span>
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-col items-center gap-4">
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-3 rounded-xl bg-[#FFC400] text-black font-extrabold px-6 py-4
                       hover:shadow-[0_10px_25px_rgba(255,196,0,0.45)] hover:scale-[1.03] transition-all duration-150"
            aria-label="Pedir pelo WhatsApp"
          >
            <MessageCircle className="w-5 h-5" />
            Pedir pelo WhatsApp
          </a>

          <div className="inline-flex items-center gap-3 rounded-full bg-[#FFC400] text-black/90 px-6 py-3 text-base md:text-lg">
            <CreditCard className="w-5 h-5" />
            Parcelamos sua bateria em até 10x no cartão de crédito
          </div>
        </div>

        {/* Selos */}
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

      {/* Scroll indicator */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none">
        <ChevronDown className="w-8 h-8 text-[#FFC400]/70 animate-bounce" />
      </div>
    </section>
  );
};

export default Hero;
