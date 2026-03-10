import { statusOrder, urgencyOrder } from "./constants";

export function getCounts(items) {
  return {
    total: items.length,
    critical: items.filter((item) => item.urgency === "Critical").length,
    sameDay: items.filter((item) => item.queue === "Same-Day Appointments").length,
    unresolved: items.filter((item) => item.status !== "Resolved").length,
  };
}

export function filterVoicemails(items, search, queueFilter, statusFilter, tab) {
  const query = search.toLowerCase();

  return items
    .filter((item) => {
      const matchesSearch =
        item.patient.toLowerCase().includes(query) ||
        item.intent.toLowerCase().includes(query) ||
        item.reason.toLowerCase().includes(query) ||
        item.location.toLowerCase().includes(query);
      const matchesQueue = queueFilter === "all" || item.queue === queueFilter;
      const matchesStatus = statusFilter === "all" || item.status === statusFilter;
      const matchesTab =
        tab === "all" ||
        (tab === "priority" && ["Critical", "High"].includes(item.urgency)) ||
        (tab === "new" && item.status === "New") ||
        (tab === "resolved" && item.status === "Resolved");

      return matchesSearch && matchesQueue && matchesStatus && matchesTab;
    })
    .sort(
      (a, b) =>
        urgencyOrder[a.urgency] - urgencyOrder[b.urgency] || statusOrder[a.status] - statusOrder[b.status],
    );
}

export function updateVoicemail(items, id, patch) {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}
