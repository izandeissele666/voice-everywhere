import voiceEverywhereLogoDark from "@/assets/voice-everywhere-logo-dark.png";
import voiceEverywhereLogo from "@/assets/voice-everywhere-logo.png";

interface BrandMarkProps {
  className?: string;
  size?: number;
}

const BrandMark = ({ className = "", size = 32 }: BrandMarkProps) => (
  <span
    aria-hidden="true"
    className={`shrink-0 overflow-hidden rounded-[11px] shadow-[0_8px_20px_-10px_var(--color-background-ui)] ${className}`}
    style={{ width: size, height: size }}
  >
    <img
      src={voiceEverywhereLogo}
      alt=""
      className="brand-logo-light h-full w-full object-cover"
    />
    <img
      src={voiceEverywhereLogoDark}
      alt=""
      className="brand-logo-dark h-full w-full object-cover"
    />
  </span>
);

export default BrandMark;
