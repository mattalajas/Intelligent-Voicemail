import React from "react";

function classes(...values) {
  return values.filter(Boolean).join(" ");
}

const variants = {
  default: "border border-transparent bg-slate-900 text-white",
  outline: "border border-slate-300 bg-white text-slate-700",
  secondary: "border border-transparent bg-slate-100 text-slate-700",
};

export function Badge({ className, variant, ...props }) {
  const resolvedVariant = variant ?? (className ? null : "default");

  return (
    <span
      className={classes(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium",
        resolvedVariant ? variants[resolvedVariant] : null,
        className,
      )}
      {...props}
    />
  );
}
