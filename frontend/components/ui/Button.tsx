// frontend/components/ui/Button.tsx
"use client";
import React from "react";
import cx from "clsx";

type Props = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "solid" | "outline" | "ghost";
};

export default function Button({ children, variant = "solid", className = "", ...props }: Props) {
  const base = "inline-flex items-center gap-2 rounded-md font-medium transition focus:outline-none focus:ring-2 focus:ring-offset-2";
  const styles =
  variant === "outline"
    ? "border border-[var(--border-plum)] text-[var(--text-primary)] bg-[var(--surface)] hover:bg-[var(--surface-page)] px-4 py-2"
    : variant === "ghost"
    ? "text-[var(--text-primary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-page)] px-3 py-2"
    : "bg-[var(--fill-plum)] text-white px-4 py-2 hover:bg-[var(--fill-ink)]";

  return (
    <button className={cx(base, styles, className)} {...props}>
      {children}
    </button>
  );
}
