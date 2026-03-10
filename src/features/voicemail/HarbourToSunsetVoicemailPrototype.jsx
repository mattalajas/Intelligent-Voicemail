import React, { useMemo, useState } from "react";
import { AlertTriangle, Clock3, ClipboardList, MessageSquareText } from "lucide-react";
import { StatCard } from "./StatCard";
import { VoicemailDetails } from "./VoicemailDetails";
import { VoicemailFilters } from "./VoicemailFilters";
import { VoicemailInbox } from "./VoicemailInbox";
import { initialVoicemails } from "./data";
import { filterVoicemails, getCounts, updateVoicemail } from "./utils";

export default function HarbourToSunsetVoicemailPrototype() {
  const [items, setItems] = useState(initialVoicemails);
  const [selectedId, setSelectedId] = useState(initialVoicemails[0].id);
  const [search, setSearch] = useState("");
  const [queueFilter, setQueueFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [tab, setTab] = useState("all");

  const counts = useMemo(() => getCounts(items), [items]);
  const filtered = useMemo(
    () => filterVoicemails(items, search, queueFilter, statusFilter, tab),
    [items, search, queueFilter, statusFilter, tab],
  );
  const selected = filtered.find((item) => item.id === selectedId) || filtered[0] || items[0];

  const updateItem = (id, patch) => {
    setItems((current) => updateVoicemail(current, id, patch));
  };

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Heidi Calls - Harbour to Sunset GP</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Morning Voicemail Triage</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Turn overnight voicemails into structured work for admin, nurse, and GP teams. Prioritised items are shown first,
              with suggested next steps and clear ownership.
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm">
            <div className="flex items-center gap-2 text-slate-700">
              <Clock3 className="h-4 w-4" />
              <span>8:02 AM handover</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">After-hours and overflow voicemails ready for review</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Inbox" value={counts.total} subtitle="Structured voicemail tasks" icon={MessageSquareText} />
          <StatCard title="Critical" value={counts.critical} subtitle="Needs immediate review" icon={AlertTriangle} />
          <StatCard title="Same-day bookings" value={counts.sameDay} subtitle="Can be actioned by front desk" icon={Clock3} />
          <StatCard title="Open work" value={counts.unresolved} subtitle="New or in progress" icon={ClipboardList} />
        </div>

        <VoicemailFilters
          items={items}
          search={search}
          setSearch={setSearch}
          queueFilter={queueFilter}
          setQueueFilter={setQueueFilter}
          statusFilter={statusFilter}
          setStatusFilter={setStatusFilter}
          tab={tab}
          setTab={setTab}
        />

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <VoicemailInbox filtered={filtered} selectedId={selected?.id} setSelectedId={setSelectedId} />
          <VoicemailDetails selected={selected} updateItem={updateItem} />
        </div>
      </div>
    </div>
  );
}
