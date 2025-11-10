import Header from "@/premium-site/components/Header";
import Hero from "@/premium-site/components/Hero";
import LogoBar from "@/premium-site/components/LogoBar";
import HowItWorks from "@/premium-site/components/HowItWorks";
import Services from "@/premium-site/components/Services";
import Coverage from "@/premium-site/components/Coverage";
import Testimonials from "@/premium-site/components/Testimonials";
import FinalCTA from "@/premium-site/components/FinalCTA";
import Footer from "@/premium-site/components/Footer";

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
