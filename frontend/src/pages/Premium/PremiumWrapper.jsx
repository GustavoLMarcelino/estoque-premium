// Integra a landing 1:1 e força tela cheia sem molduras.
// Ativa a classe 'landing-mode' no <html> só enquanto esta rota existir.

import React from "react";
import "@/index.css";
import "@/App.css";
import "@/premium-site/index.css";
import "./premium-reset.css";

import { TooltipProvider } from "@/premium-site/components/ui/tooltip";
import { Toaster } from "@/premium-site/components/ui/toaster";
import { Toaster as Sonner } from "@/premium-site/components/ui/sonner";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import Index from "@/premium-site/pages/Index";

const queryClient = new QueryClient();

export default function PremiumWrapper() {
  React.useEffect(() => {
    // liga um modo que zera margens/padding/bordas de contêineres externos
    document.documentElement.classList.add("landing-mode");
    return () => {
      document.documentElement.classList.remove("landing-mode");
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {/* 
          Contêiner FIXO cobrindo a viewport inteira. 
          Assim, mesmo se algum pai tiver padding/borda, isso fica por baixo.
        */}
        <div
          className="premium-root"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 0,
            background: "hsl(0 0% 0%)",
            overflowY: "auto",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <div className="premium-scope">
            <Index />
          </div>
        </div>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
