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
    ? "border border-primary-500 text-primary-700 bg-white hover:bg-primary-50 px-4 py-2"
    : variant === "ghost"
    ? "text-primary-700 hover:text-primary-900 hover:bg-primary-50 px-3 py-2"
    : "bg-primary-500 text-white px-4 py-2 hover:bg-primary-600";

  return (
    <button className={cx(base, styles, className)} {...props}>
      {children}
    </button>
  );
}
