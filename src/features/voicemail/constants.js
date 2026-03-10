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
  Critical: "bg-red-100 text-red-700 border-red-200",
  High: "bg-rose-100 text-rose-700 border-rose-200",
  Normal: "bg-pink-100 text-pink-700 border-pink-200",
  Low: "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200",
  Unknown: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

export const statusStyles = {
  New: "bg-blue-600 text-white",
  "In Progress": "bg-yellow-500 text-slate-950",
  Resolved: "bg-emerald-600 text-white",
};

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
