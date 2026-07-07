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

      {/* Conteúdo
          Esta seção replica o layout do desktop em todas as larguras (decisão
          de design: o Hero é exceção à regra de não mexer em mobile/tablet).
          O visual — linha de parcelamento discreta, selos sutis, botão grande,
          subtítulo — é uniforme; só o título recua um passo no mobile (<md)
          para não quebrar em muitas linhas num celular estreito. */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 md:py-40 text-center">
        {/* Título grande: branco + amarelo */}
        <h1 className="text-white font-extrabold leading-[1.05] text-5xl md:text-7xl">
          Ficou sem partida?
          <br />
          <span className="text-[#FFC400]">A Premium vai até você.</span>
        </h1>

        {/* Subtítulo */}
        <p className="mt-6 text-2xl text-white/90">
          Entrega rápida e instalação especializada em{" "}
          <span className="font-semibold text-white">Barra Velha e região.</span>
        </p>

        {/* CTA principal + faixa de parcelamento (linha discreta, igual desktop) */}
        <div className="mt-8 flex flex-col items-center gap-3">
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-3 rounded-xl bg-[#FFC400] text-black font-extrabold px-8 py-4 text-lg
                       shadow-[0_8px_20px_rgba(255,196,0,0.25)]
                       hover:shadow-[0_10px_25px_rgba(255,196,0,0.35)] transition"
            aria-label="Pedir pelo WhatsApp"
          >
            <MessageCircle className="w-5 h-5" />
            Pedir pelo WhatsApp
          </a>

          <div className="inline-flex items-center gap-2 text-sm text-white/70">
            <CreditCard className="w-4 h-4 text-[#FFC400]" />
            Parcelamos sua bateria em até 10x no cartão de crédito
          </div>
        </div>

        {/* Selos/pílulas (visual sutil do desktop em todas as larguras) */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FFC400]/50 bg-black/20 px-4 py-2 text-sm text-white">
            <CheckCircle className="w-4 h-4 text-[#FFC400]" />
            <span className="font-medium">Teste de carga</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FFC400]/50 bg-black/20 px-4 py-2 text-sm text-white">
            <Shield className="w-4 h-4 text-[#FFC400]" />
            <span className="font-medium">Garantia</span>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#FFC400]/50 bg-black/20 px-4 py-2 text-sm text-white">
            <Clock className="w-4 h-4 text-[#FFC400]" />
            <span className="font-medium">Atendimento 24h</span>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Hero;
