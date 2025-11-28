// src/premium-site/components/Header.tsx
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

// ✅ IMPORTS RELATIVOS (ajustados)
import { Button } from "@/pages/Premium/landing/ui/button";
import logo from '../assets/logo.png';

const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navItems = [
    { label: "Início", href: "#inicio" },
    { label: "Baterias", href: "#baterias" },
    { label: "Instalação", href: "#instalacao" },
    { label: "Contato", href: "#contato" },
  ];

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 text-white transition-all duration-300 ${
        isScrolled ? "bg-black/80 backdrop-blur-md shadow-elegant" : "bg-black/60"
      }`}
    >
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-20">
          {/* Logo */}
          <div className="flex items-center">
            <a href="#inicio" className="flex items-center">
              <img
                src={logo}
                alt="Premium Baterias"
                className="h-16 md:h-20 w-auto transition-transform hover:scale-105"
              />
            </a>
          </div>

          {/* Navegação desktop */}
          <nav className="hidden md:flex items-center space-x-8">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="text-white hover:text-yellow-400 transition-colors duration-300 font-medium"
              >
                {item.label}
              </a>
            ))}
          </nav>

          {/* Botão Entrar (desktop) */}
          <div className="hidden md:block">
            <Link to="/login" aria-label="Entrar no sistema">
              <Button
                variant="outline"
                className="border-2 border-yellow-400 bg-transparent text-white hover:bg-yellow-400 hover:text-black transition-all duration-300"
              >
                Entrar
              </Button>
            </Link>
          </div>

          {/* Menu mobile toggle */}
          <button
            className="md:hidden text-white hover:text-yellow-400 transition-colors"
            onClick={() => setIsMobileMenuOpen((v) => !v)}
            aria-label="Abrir menu"
          >
            {/* Ícone simples (sem lucide) pra evitar dependência */}
            <span className="inline-block w-6 h-0.5 bg-white mb-1" />
            <span className="inline-block w-6 h-0.5 bg-white mb-1" />
            <span className="inline-block w-6 h-0.5 bg-white" />
          </button>
        </div>

        {/* Menu mobile */}
        {isMobileMenuOpen && (
          <div className="md:hidden py-6 space-y-4 border-t border-yellow-400/20">
            {navItems.map((item) => (
              <a
                key={item.label}
                href={item.href}
                className="block text-white hover:text-yellow-400 transition-colors duration-300 font-medium py-2"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                {item.label}
              </a>
            ))}

            <Link to="/login" onClick={() => setIsMobileMenuOpen(false)} aria-label="Entrar no sistema">
              <Button
                variant="outline"
                className="w-full border-2 border-yellow-400 bg-transparent text-white hover:bg-yellow-400 hover:text-black transition-all duration-300"
              >
                Entrar
              </Button>
            </Link>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;


