import { statusOrder, urgencyOrder } from "./constants";

export function getCounts(items) {
  return {
    total: items.length,
    critical: items.filter((item) => item.urgency === "Critical").length,
    sameDay: items.filter((item) => item.queue === "Same-Day Appointments").length,
    unresolved: items.filter((item) => item.status !== "Resolved").length,
  };
}

export function filterVoicemails(items, search, queueFilter, statusFilter, urgencyFilter, tab) {
  const query = search.toLowerCase();

  return items
    .filter((item) => {
      const matchingIntentLabels = item.intents?.some((intent) => intent.label.toLowerCase().includes(query));
      const matchesSearch =
        item.patient.toLowerCase().includes(query) ||
        item.phone.toLowerCase().includes(query) ||
        item.intent.toLowerCase().includes(query) ||
        matchingIntentLabels ||
        item.reason.toLowerCase().includes(query) ||
        item.location.toLowerCase().includes(query);
      const matchesQueue = queueFilter === "all" || item.queue === queueFilter;
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesUrgency = urgencyFilter === "all" || item.urgency === urgencyFilter;
      const matchesTab =
        tab === "all" ||
        (tab === "priority" && ["Critical", "High"].includes(item.urgency)) ||
        (tab === "unresolved" && item.status !== "Resolved") ||
        (tab === "resolved" && item.status === "Resolved");

      return matchesSearch && matchesQueue && matchesStatus && matchesUrgency && matchesTab;
    })
    .sort(
      (a, b) =>
        urgencyOrder[a.urgency] - urgencyOrder[b.urgency] || statusOrder[a.status] - statusOrder[b.status],
    );
}

export function updateVoicemail(items, id, patch) {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}
