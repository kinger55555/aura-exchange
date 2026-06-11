import { GlitchText } from "./GlitchText";

type Props = {
  nickname: string | null | undefined;
  titleText?: string | null;
  titlePosition?: "prefix" | "suffix" | null;
  isGlitch?: boolean | null;
  className?: string;
};

export function DisplayName({ nickname, titleText, titlePosition, isGlitch, className }: Props) {
  const nick = nickname ?? "";
  if (!titleText) return <span className={className}>{nick}</span>;
  const inner = isGlitch ? <GlitchText length={Math.max(4, titleText.trim().length)} /> : <>{titleText.trim()}</>;
  const tag = <span>[{inner}]</span>;
  return (
    <span className={className}>
      {titlePosition === "suffix" ? (<>{nick} {tag}</>) : (<>{tag} {nick}</>)}
    </span>
  );
}