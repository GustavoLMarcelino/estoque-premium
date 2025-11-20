import { Phone, Mail, MapPin, Clock, Facebook, Instagram } from "lucide-react";
import { WHATSAPP_DISPLAY } from "@/pages/Premium/landing/constants/contact";

const INSTAGRAM_URL = "https://www.instagram.com/premiumbateriasbv/";
const FACEBOOK_URL = "https://www.facebook.com/Premiumbateriasbv";
const CONTACT_EMAIL = "premiumbateriasbv@gmail.com";

export default function Footer() {
  return (
    <footer className="bg-black text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-10">
        {/* grid 4 colunas */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* 1) Marca/descrição */}
          <div>
            <h3 className="text-xl font-extrabold">
              PREMIUM <span className="text-[#FFC400]">BATERIAS</span>
            </h3>
            <p className="mt-4 text-white/80 max-w-sm">
              Soluções em baterias automotivas com atendimento especializado em
              Barra Velha e região.
            </p>
          </div>

          {/* 2) Contato */}
          <div>
            <h4 className="text-lg font-extrabold text-[#FFC400]">Contato</h4>
            <ul className="mt-4 space-y-3 text-white/90">
              <li className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-[#FFC400]" />
                {WHATSAPP_DISPLAY}
              </li>
              <li className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-[#FFC400]" />
                <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-[#FFC400]">
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-[#FFC400]" />
                Barra Velha, SC
              </li>
            </ul>
          </div>

          {/* 3) Horário */}
          <div>
            <h4 className="text-lg font-extrabold text-[#FFC400]">Horário</h4>
            <ul className="mt-4 space-y-3 text-white/90">
              <li className="flex items-start gap-2">
                <Clock className="w-4 h-4 mt-1 text-[#FFC400]" />
                <div>
                  <div className="font-semibold">Segunda a Sexta</div>
                  <div className="text-white/80">8h às 18h</div>
                </div>
              </li>
              <li className="flex items-start gap-2">
                <Clock className="w-4 h-4 mt-1 text-[#FFC400]" />
                <div>
                  <div className="font-semibold">Sábados</div>
                  <div className="text-white/80">8h às 12h</div>
                </div>
              </li>
            </ul>
            <p className="mt-3 text-[#FFC400] text-sm font-semibold">
              * Socorro 24h disponível
            </p>
          </div>

          {/* 4) Informações + redes */}
          <div>
            <h4 className="text-lg font-extrabold text-[#FFC400]">Informações</h4>
            <ul className="mt-4 space-y-3 text-white/90">
              <li><a href="#" className="hover:opacity-90">Política de Privacidade</a></li>
              <li><a href="#" className="hover:opacity-90">Termos de Uso</a></li>
              <li><a href="/garantia" className="hover:opacity-90">Garantia</a></li>
            </ul>

            <div className="mt-4 flex items-center gap-4">
              <a
                href={FACEBOOK_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Facebook"
                className="hover:opacity-90"
              >
                <Facebook className="w-5 h-5" />
              </a>
              <a
                href={INSTAGRAM_URL}
                target="_blank"
                rel="noreferrer"
                aria-label="Instagram"
                className="hover:opacity-90"
              >
                <Instagram className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>

        {/* linha amarela */}
        <div className="mt-8 border-t border-[#FFC400]" />

        {/* barra final */}
        <div className="mt-4 flex flex-col md:flex-row items-center justify-between text-white/70 text-sm">
          <p>© 2025 Premium Baterias. Todos os direitos reservados.</p>
          <p className="mt-2 md:mt-0 text-[#FFC400] font-semibold">Deus é fiel</p>
        </div>
      </div>
    </footer>
  );
}

