import Header from "@/pages/Premium/landing/components/Header";
import Hero from "@/pages/Premium/landing/components/Hero";
import LogoBar from "@/pages/Premium/landing/components/LogoBar";
import HowItWorks from "@/pages/Premium/landing/components/HowItWorks";
import Services from "@/pages/Premium/landing/components/Services";
import Coverage from "@/pages/Premium/landing/components/Coverage";
import Testimonials from "@/pages/Premium/landing/components/Testimonials";
import FinalCTA from "@/pages/Premium/landing/components/FinalCTA";
import Footer from "@/pages/Premium/landing/components/Footer";

const Index = () => {
  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <LogoBar />
        <HowItWorks />
        <Services />
        <Coverage />
        <Testimonials />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
};

export default Index;

