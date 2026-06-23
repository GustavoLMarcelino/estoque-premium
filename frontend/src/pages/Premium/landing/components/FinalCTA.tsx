import { WHATSAPP_URL } from "@/pages/Premium/landing/constants/contact";
import { MessageCircle } from "lucide-react";

export default function FinalCTA() {
  return (
    <section
      id="contato"
      className="relative overflow-hidden bg-black text-white"
    >
      {/* Decorative shape */}
      <div
        aria-hidden
        className="hidden md:block absolute top-0 right-0 h-full w-[45%] -skew-x-12 bg-[#1a1400] opacity-70 z-0 pointer-events-none"
      />

      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20 text-center">
        <h2 className="text-4xl md:text-5xl font-extrabold">Precisando agora?</h2>
        <p className="mt-3 text-white/80">
          Entre em contato pelo WhatsApp e resolva seu problema em minutos
        </p>

        <div className="mt-8 flex flex-col items-center gap-3">
          {/* Button with pulse ring */}
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noreferrer"
            className="relative inline-flex items-center gap-3 rounded-xl bg-[#FFC400] text-black font-extrabold px-6 py-4
                       hover:shadow-[0_10px_25px_rgba(255,196,0,0.45)] hover:scale-[1.03] transition-all duration-150"
            aria-label="Pedir pelo WhatsApp"
          >
            <span
              aria-hidden
              className="absolute inset-0 rounded-xl animate-ping bg-[#FFC400]/30"
            />
            <MessageCircle className="relative z-10 w-5 h-5" />
            <span className="relative z-10">Pedir pelo WhatsApp</span>
          </a>

          <p className="text-white/50 text-sm">
            Tempo médio de chegada: 30 minutos
          </p>
        </div>
      </div>
    </section>
  );
}
