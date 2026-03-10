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
  High: "bg-amber-100 text-amber-700 border-amber-200",
  Normal: "bg-blue-100 text-blue-700 border-blue-200",
  Low: "bg-slate-100 text-slate-700 border-slate-200",
  Unknown: "bg-zinc-100 text-zinc-700 border-zinc-200",
};

export const statusStyles = {
  New: "bg-slate-900 text-white",
  "In Progress": "bg-amber-500 text-white",
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
