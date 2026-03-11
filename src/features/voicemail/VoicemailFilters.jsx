import React from "react";
import { Filter, Search } from "lucide-react";
import { Card, CardContent } from "../../components/ui/card";
import { Input } from "../../components/ui/input";

export function VoicemailFilters({
  items,
  search,
  setSearch,
  queueFilter,
  setQueueFilter,
  statusFilter,
  setStatusFilter,
  urgencyFilter,
  setUrgencyFilter,
  tab,
  setTab,
}) {
  const queues = [...new Set(items.map((item) => item.queue))];
  const urgencies = ["Critical", "High", "Normal", "Low", "Unknown"];
  const tabs = [
    { value: "all", label: "All" },
    { value: "priority", label: "Priority" },
    { value: "unresolved", label: "Unresolved" },
    { value: "resolved", label: "Resolved" },
  ];

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 items-center gap-3">
            <div className="relative w-full max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search patient, queue, location, or reason"
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <select
              value={queueFilter}
              onChange={(event) => setQueueFilter(event.target.value)}
              className="h-10 w-[210px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="all">All queues</option>
              {queues.map((queue) => (
                <option key={queue} value={queue}>
                  {queue}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              className="h-10 w-[170px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="all">All statuses</option>
              <option value="New">New</option>
              <option value="In Progress">In Progress</option>
              <option value="Resolved">Resolved</option>
            </select>
            <select
              value={urgencyFilter}
              onChange={(event) => setUrgencyFilter(event.target.value)}
              className="h-10 w-[170px] rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
            >
              <option value="all">All urgency</option>
              {urgencies.map((urgency) => (
                <option key={urgency} value={urgency}>
                  {urgency}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 grid w-full grid-cols-2 gap-2 md:w-[520px] md:grid-cols-4">
          {tabs.map((tabItem) => {
            const isActive = tab === tabItem.value;
            return (
              <button
                key={tabItem.value}
                type="button"
                onClick={() => setTab(tabItem.value)}
                className={[
                  "rounded-xl px-4 py-2 text-sm font-medium transition",
                  isActive ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200",
                ].join(" ")}
              >
                {tabItem.label}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
