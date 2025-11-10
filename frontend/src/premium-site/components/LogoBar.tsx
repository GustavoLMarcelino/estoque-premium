// Mostra as marcas em uma faixa com borda sutil
// Usa texto preto e espaçamento grande entre os itens
import React from "react";

const brands = ["Moura", "Heliar", "ACDelco", "Eletran"];

export default function LogoBar() {
  return (
    <section
      aria-label="Marcas atendidas"
      className="bg-white border-y border-black/10"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <ul className="flex items-center justify-center gap-10 md:gap-16 py-5">
          {brands.map((name) => (
            <li
              key={name}
              className="text-black font-extrabold text-xl md:text-2xl tracking-tight"
            >
              {name}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
