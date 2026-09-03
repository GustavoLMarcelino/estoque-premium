// frontend/src/premium-site/constants/contact.ts
// -> Centraliza número e link do Whats para uso nos componentes (Hero, Footer, FinalCTA)

export const WHATSAPP_NUMBER = "5547997398620";
export const WHATSAPP_DISPLAY = "(47) 99739-8620";

/** Texto padrão (URL-encoded) que aparece preenchido ao abrir o WhatsApp */
export const WHATSAPP_DEFAULT_TEXT =
  encodeURIComponent("Olá, gostaria de mais informações");

// Link completo para o botão de WhatsApp
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}?text=${WHATSAPP_DEFAULT_TEXT}`;
