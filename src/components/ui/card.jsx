import React from "react";

function classes(...values) {
  return values.filter(Boolean).join(" ");
}

export function Card({ className, ...props }) {
  return <div className={classes("border border-slate-200 bg-white", className)} {...props} />;
}

export function CardHeader({ className, ...props }) {
  return <div className={classes("px-6 pt-6", className)} {...props} />;
}

export function CardTitle({ className, ...props }) {
  return <h2 className={classes("text-base font-semibold text-slate-900", className)} {...props} />;
}

export function CardContent({ className, ...props }) {
  return <div className={classes("px-6 pb-6", className)} {...props} />;
}
