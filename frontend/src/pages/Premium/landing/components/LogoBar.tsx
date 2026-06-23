// Brands bar with infinite marquee animation
import React from "react";

const brands = ["Moura", "Heliar", "ACDelco", "Eletran", "Bosch", "Varta"];

// Duplicate for seamless loop
const track = [...brands, ...brands];

export default function LogoBar() {
  return (
    <section
      aria-label="Marcas atendidas"
      className="bg-white border-y border-black/10 overflow-hidden"
    >
      <div
        className="flex"
        style={{ animation: "marquee 20s linear infinite" }}
      >
        {track.map((name, i) => (
          <React.Fragment key={i}>
            <span className="flex items-center shrink-0 py-5 px-10 text-black font-extrabold text-xl md:text-2xl tracking-tight whitespace-nowrap">
              {name}
            </span>
            <span className="flex items-center shrink-0 py-5 text-black/20 text-xl select-none">
              ·
            </span>
          </React.Fragment>
        ))}
      </div>
    </section>
  );
}
