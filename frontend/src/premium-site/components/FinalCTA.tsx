import { WHATSAPP_URL } from "@/premium-site/constants/contact";
import { MessageCircle } from "lucide-react";

export default function FinalCTA() {
  return (
    <section
      id="contato"
      className="relative overflow-hidden bg-black text-white" // <- overflow-hidden para não vazar
    >
      {/* shape decorativo (fica por trás e não rouba clique) */}
      <div
        aria-hidden
        className="hidden md:block absolute top-0 right-0 h-full w-[45%] -skew-x-12 bg-[#1a1400] opacity-70 z-0 pointer-events-none"
      />

      {/* conteúdo acima do shape */}
      <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20 text-center">
        <h2 className="text-4xl md:text-5xl font-extrabold">Precisando agora?</h2>
        <p className="mt-3 text-white/80">
          Entre em contato pelo WhatsApp e resolva seu problema em minutos
        </p>

        <div className="mt-8">
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
        </div>
      </div>
    </section>
  );
}
