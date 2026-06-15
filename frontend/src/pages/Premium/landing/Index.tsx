import { useEffect, useRef, useState } from "react";
import { MessageCircle } from "lucide-react";
import { WHATSAPP_URL } from "@/pages/Premium/landing/constants/contact";
import Header from "@/pages/Premium/landing/components/Header";
import Hero from "@/pages/Premium/landing/components/Hero";
import LogoBar from "@/pages/Premium/landing/components/LogoBar";
import HowItWorks from "@/pages/Premium/landing/components/HowItWorks";
import Services from "@/pages/Premium/landing/components/Services";
import Coverage from "@/pages/Premium/landing/components/Coverage";
import Testimonials from "@/pages/Premium/landing/components/Testimonials";
import FinalCTA from "@/pages/Premium/landing/components/FinalCTA";
import Footer from "@/pages/Premium/landing/components/Footer";

function AnimateOnScroll({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { threshold: 0.08 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-6"
      }`}
    >
      {children}
    </div>
  );
}

const Index = () => {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <AnimateOnScroll><LogoBar /></AnimateOnScroll>
        <AnimateOnScroll><HowItWorks /></AnimateOnScroll>
        <AnimateOnScroll><Services /></AnimateOnScroll>
        <AnimateOnScroll><Coverage /></AnimateOnScroll>
        <AnimateOnScroll><Testimonials /></AnimateOnScroll>
        <AnimateOnScroll><FinalCTA /></AnimateOnScroll>
      </main>
      <Footer />

      {/* Floating WhatsApp button */}
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noreferrer"
        aria-label="Chamar no WhatsApp"
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-[#FFC400] text-black shadow-lg transition-transform hover:scale-110"
      >
        {/* Pulse ring */}
        <span className="absolute inset-0 animate-ping rounded-full bg-[#FFC400]/40" />
        <MessageCircle className="relative z-10 h-7 w-7" />
      </a>
    </div>
  );
};

export default Index;
