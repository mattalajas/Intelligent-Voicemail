import React from "react";

function classes(...values) {
  return values.filter(Boolean).join(" ");
}

export function Input({ className, type = "text", ...props }) {
  return (
    <input
      type={type}
      className={classes(
        "flex h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-300",
        className,
      )}
      {...props}
    />
  );
}
