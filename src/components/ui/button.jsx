import React from "react";

function classes(...values) {
  return values.filter(Boolean).join(" ");
}

const variants = {
  default: "bg-slate-900 text-white hover:bg-slate-800",
  outline: "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
  secondary: "bg-slate-100 text-slate-800 hover:bg-slate-200",
};

const sizes = {
  default: "h-10 px-4 py-2",
  sm: "h-9 px-3",
};

export function Button({ className, variant = "default", size = "default", type = "button", ...props }) {
  return (
    <button
      type={type}
      className={classes(
        "inline-flex items-center justify-center rounded-xl text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  );
}
