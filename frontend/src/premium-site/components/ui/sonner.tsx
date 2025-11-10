// frontend/src/premium-site/components/ui/sonner.tsx
// -> Adaptação para Vite/React sem next-themes.
//    Lê o tema pela classe "dark" no <html> (se você ativar dark mode no Tailwind).
//    Mantém a API 'toast' e o componente <Toaster /> exatamente como a landing original.

import * as React from "react";
import { Toaster as Sonner, toast } from "sonner";

function useDocumentTheme(): "light" | "dark" {
  const [theme, setTheme] = React.useState<"light" | "dark">("light");
  React.useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);
  return theme;
}

export { toast };

export const Toaster = ({
  ...props
}: React.ComponentProps<typeof Sonner>) => {
  const theme = useDocumentTheme();
  return (
    <Sonner
      theme={theme}          // "light" por padrão; vira "dark" se <html class="dark">
      richColors
      expand={false}
      position="top-center"
      {...props}
    />
  );
};
