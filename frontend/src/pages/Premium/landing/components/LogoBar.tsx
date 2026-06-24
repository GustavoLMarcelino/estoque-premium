// Brands bar with seamless infinite marquee animation
import React from "react";

const brands = [
  "Acdelco",
  "Eletran",
  "Freedom",
  "Haizer",
  "Heliar",
  "Jupiter",
  "Moura",
  "Pioneiro",
  "Real",
  "Varta",
];

// Duplicate the list so translateX(-50%) loops seamlessly (no visible restart)
const track = [...brands, ...brands];

export default function LogoBar() {
  return (
    <section
      aria-label="Marcas atendidas"
      className="bg-white border-y border-black/10 overflow-hidden"
    >
      {/* w-max makes the track as wide as its content, so -50% = exactly one full set */}
      <div
        className="flex w-max items-center"
        style={{ animation: "scroll 30s linear infinite" }}
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
