import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2, type LucideIcon } from "lucide-react";

/**
 * 비박스 공용 버튼. 흩어진 버튼 구현을 이걸로 통일.
 *  - variant: primary(주황) · secondary(흰/테두리) · ghost(투명) · danger(연빨강)
 *  - size: sm(30) · md(36) · lg(42)
 *  - icon(좌)·iconRight(우)·loading(스피너)·disabled
 * 색/타이포/라운딩은 전부 토큰(text-base 등). focus-visible 링 기본 포함(a11y).
 */
type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  iconRight?: LucideIcon;
  loading?: boolean;
};

const VARIANT: Record<Variant, string> = {
  primary: "bg-accent text-white border-transparent hover:bg-accent-hover",
  secondary:
    "bg-white text-text border-border hover:border-border-hover hover:bg-surface",
  ghost:
    "bg-transparent text-text-soft border-transparent hover:bg-surface hover:text-text",
  danger: "bg-danger-soft text-danger border-transparent hover:bg-[#fbdcdc]",
};

const SIZE: Record<Size, string> = {
  sm: "h-[30px] px-2.5 text-xs gap-1.5 rounded-md",
  md: "h-9 px-3.5 text-base gap-1.5 rounded-md",
  lg: "h-[42px] px-5 text-md gap-2 rounded-lg",
};

const ICON_PX: Record<Size, number> = { sm: 14, md: 16, lg: 18 };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    icon: Icon,
    iconRight: IconRight,
    loading = false,
    disabled,
    className = "",
    children,
    ...rest
  },
  ref,
) {
  const px = ICON_PX[size];
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center font-bold border whitespace-nowrap transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/55 focus-visible:ring-offset-1 ${SIZE[size]} ${VARIANT[variant]} ${className}`}
      {...rest}
    >
      {loading ? (
        <Loader2 size={px} strokeWidth={2.2} className="animate-spin" />
      ) : Icon ? (
        <Icon size={px} strokeWidth={2.2} />
      ) : null}
      {children}
      {IconRight && !loading ? (
        <IconRight size={px} strokeWidth={2.2} />
      ) : null}
    </button>
  );
});
