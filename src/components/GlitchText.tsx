import { useEffect, useState } from "react";

const GLITCH_CHARS = "!@#$%&*<>?/\\|=+-_~^≡░▒▓█▄▀◊⚡ΣΔΨΦΩЖЯЦЬЪЭ01";

function scramble(len: number) {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
  }
  return out;
}

export function GlitchText({ length = 6, className }: { length?: number; className?: string }) {
  const [txt, setTxt] = useState(() => scramble(length));
  useEffect(() => {
    const t = setInterval(() => setTxt(scramble(length)), 90);
    return () => clearInterval(t);
  }, [length]);
  return (
    <span className={className} style={{ fontFamily: "monospace", letterSpacing: "0.05em" }}>
      {txt}
    </span>
  );
}