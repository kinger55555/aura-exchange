import { GlitchText } from "./GlitchText";
import { titleTone } from "@/lib/rank";

type Props = {
  nickname: string | null | undefined;
  titleText?: string | null;
  titlePosition?: "prefix" | "suffix" | null;
  isGlitch?: boolean | null;
  titleTier?: string | null;
  className?: string;
};

export function DisplayName({ nickname, titleText, titlePosition, isGlitch, titleTier, className }: Props) {
  const nick = nickname ?? "";
  if (!titleText) return <span className={className}>{nick}</span>;
  const tone = titleTier ? titleTone({ tier: titleTier, is_glitch: isGlitch, text: titleText }) : "";
  const inner = isGlitch ? <GlitchText length={Math.max(4, titleText.trim().length)} /> : <>{titleText.trim()}</>;
  const tag = <span className={tone}>[{inner}]</span>;
  return (
    <span className={className}>
      {titlePosition === "suffix" ? (<>{nick} {tag}</>) : (<>{tag} {nick}</>)}
    </span>
  );
}