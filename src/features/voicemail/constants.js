import {
  AlertTriangle,
  ClipboardList,
  Clock3,
  Hospital,
  MessageSquareText,
  Phone,
  Stethoscope,
} from "lucide-react";

export const urgencyStyles = {
  Critical: "bg-red-300 text-red-700 border-red-200",
  High: "bg-rose-50 text-rose-700 border-rose-200",
  Normal: "bg-orange-50 text-pink-700 border-pink-200",
  Low: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
  Unknown: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

export const statusStyles = {
  New: "bg-blue-600 text-white",
  "In Progress": "bg-yellow-500 text-slate-950",
  Resolved: "bg-emerald-600 text-white",
};

export const statusActionStyles = {
  New: {
    active: "border border-blue-600 bg-blue-600 text-white hover:bg-blue-500",
    inactive: "border border-slate-300 bg-white text-slate-700 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700",
  },
  "In Progress": {
    active: "border border-yellow-400 bg-yellow-500 text-slate-950 hover:bg-yellow-400",
    inactive: "border border-slate-300 bg-white text-slate-700 hover:border-yellow-200 hover:bg-yellow-50 hover:text-yellow-800",
  },
  Resolved: {
    active: "border border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-500",
    inactive: "border border-slate-300 bg-white text-slate-700 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700",
  },
};

export const ownerLabelStyles = {
  nurseTriage: "border border-cyan-200 bg-cyan-50 text-cyan-800",
  gpReview: "border border-violet-200 bg-violet-50 text-violet-800",
  frontDesk: "border border-amber-200 bg-amber-50 text-amber-800",
  default: "border border-slate-200 bg-slate-100 text-slate-700",
};

export const ownerRecommendationBoxStyles = {
  nurseTriage: "border-cyan-200 bg-cyan-50",
  gpReview: "border-violet-200 bg-violet-50",
  frontDesk: "border-amber-200 bg-amber-50",
  default: "border-slate-200 bg-slate-50",
};

export function getOwnerLabelStyle(ownerLabel) {
  const normalizedLabel = String(ownerLabel || "").trim();

  if (normalizedLabel === "Nurse triage") {
    return ownerLabelStyles.nurseTriage;
  }

  if (normalizedLabel === "Front desk") {
    return ownerLabelStyles.frontDesk;
  }

  if (normalizedLabel === "GP review" || /^Dr\b/i.test(normalizedLabel)) {
    return ownerLabelStyles.gpReview;
  }

  return ownerLabelStyles.default;
}

export function getOwnerRecommendationBoxStyle(ownerLabel) {
  const normalizedLabel = String(ownerLabel || "").trim();

  if (normalizedLabel === "Nurse triage") {
    return ownerRecommendationBoxStyles.nurseTriage;
  }

  if (normalizedLabel === "Front desk") {
    return ownerRecommendationBoxStyles.frontDesk;
  }

  if (normalizedLabel === "GP review" || /^Dr\b/i.test(normalizedLabel)) {
    return ownerRecommendationBoxStyles.gpReview;
  }

  return ownerRecommendationBoxStyles.default;
}

export const queueIcons = {
  "Emergency Review": AlertTriangle,
  "Clinical Triage": Stethoscope,
  "Same-Day Appointments": Clock3,
  "Prescription Requests": ClipboardList,
  "GP Callbacks": Phone,
  "Admin Requests": Hospital,
  "Needs Review": MessageSquareText,
  "Test Results": ClipboardList,
};

export const urgencyOrder = {
  Critical: 0,
  High: 1,
  Normal: 2,
  Low: 3,
  Unknown: 4,
};

export const statusOrder = {
  New: 0,
  "In Progress": 1,
  Resolved: 2,
};
