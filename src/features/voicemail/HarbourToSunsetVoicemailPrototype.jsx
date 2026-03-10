import React, { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Clock3, ClipboardList, MessageSquareText } from "lucide-react";
import { StatCard } from "./StatCard";
import { VoicemailDetails } from "./VoicemailDetails";
import { VoicemailFilters } from "./VoicemailFilters";
import { VoicemailInbox } from "./VoicemailInbox";
import { fetchQueues, fetchVoicemails, patchVoicemail } from "./api";
import { filterVoicemails, getCounts } from "./utils";

function buildSelectedVoicemail(group, voicemailId) {
  if (!group) {
    return null;
  }

  const selectedEntry =
    group.history?.find((entry) => entry.voicemailId === voicemailId) ??
    group.history?.[0] ??
    null;

  if (!selectedEntry) {
    return group;
  }

  return {
    ...group,
    selectedVoicemailId: selectedEntry.voicemailId,
    isHistoricalSelection: selectedEntry.voicemailId !== group.latestVoicemailId,
    time: selectedEntry.time,
    age: selectedEntry.age,
    intent: selectedEntry.intent,
    intents: selectedEntry.intents,
    intentThreshold: selectedEntry.intentThreshold,
    primaryIntentScore: selectedEntry.primaryIntentScore,
    urgency: selectedEntry.urgency,
    urgencySource: selectedEntry.urgencySource,
    matchedUrgencyKeywords: selectedEntry.matchedUrgencyKeywords,
    patientUrgencyMarker: selectedEntry.patientUrgencyMarker,
    reason: selectedEntry.reason,
    summary: selectedEntry.summary,
    transcript: selectedEntry.transcript,
    summaryConfidence: selectedEntry.summaryConfidence,
  };
}

export default function HarbourToSunsetVoicemailPrototype() {
  const [items, setItems] = useState([]);
  const [queues, setQueues] = useState([]);
  const [selectedGroupId, setSelectedGroupId] = useState(null);
  const [selectedVoicemailId, setSelectedVoicemailId] = useState(null);
  const [search, setSearch] = useState("");
  const [queueFilter, setQueueFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [urgencyFilter, setUrgencyFilter] = useState("all");
  const [tab, setTab] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError("");
        const [nextItems, nextQueues] = await Promise.all([fetchVoicemails(), fetchQueues()]);
        if (cancelled) {
          return;
        }
        setItems(nextItems);
        setQueues(nextQueues);
        setSelectedGroupId((current) => current ?? nextItems[0]?.id ?? null);
        setSelectedVoicemailId((current) => current ?? nextItems[0]?.latestVoicemailId ?? null);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Unable to load voicemails");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, []);

  const counts = useMemo(() => getCounts(items), [items]);
  const filtered = useMemo(
    () => filterVoicemails(items, search, queueFilter, statusFilter, urgencyFilter, tab),
    [items, search, queueFilter, statusFilter, urgencyFilter, tab],
  );
  const availableQueues = useMemo(() => queues.map((queue) => queue.name).sort(), [queues]);
  const selectedGroup =
    filtered.find((item) => item.id === selectedGroupId) ||
    filtered[0] ||
    items.find((item) => item.id === selectedGroupId) ||
    items[0] ||
    null;
  const selected = useMemo(
    () => buildSelectedVoicemail(selectedGroup, selectedVoicemailId),
    [selectedGroup, selectedVoicemailId],
  );

  useEffect(() => {
    if (!selectedGroup && (selectedGroupId || selectedVoicemailId)) {
      setSelectedGroupId(null);
      setSelectedVoicemailId(null);
      return;
    }

    if (!selectedGroup && filtered[0]) {
      setSelectedGroupId(filtered[0].id);
      setSelectedVoicemailId(filtered[0].latestVoicemailId);
      return;
    }

    if (!selectedGroup) {
      return;
    }

    const hasSelectedVoicemail = selectedGroup.history?.some((entry) => entry.voicemailId === selectedVoicemailId);

    if (selectedGroup.id !== selectedGroupId) {
      setSelectedGroupId(selectedGroup.id);
    }

    if (!hasSelectedVoicemail) {
      setSelectedVoicemailId(selectedGroup.latestVoicemailId);
    }
  }, [filtered, items, selectedGroup, selectedGroupId, selectedVoicemailId]);

  function handleSelectVoicemail(groupId, voicemailId) {
    setSelectedGroupId(groupId);
    setSelectedVoicemailId(voicemailId);
  }

  async function updateItem(id, patch) {
    try {
      setSavingId(id);
      setError("");
      const updated = await patchVoicemail(id, patch);
      setItems((current) => current.map((item) => (item.id === id ? updated : item)));
    } catch (updateError) {
      setError(updateError.message || "Unable to update voicemail");
    } finally {
      setSavingId("");
    }
  }

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

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard title="Inbox" value={counts.total} subtitle="Structured voicemail tasks" icon={MessageSquareText} />
          <StatCard title="Critical" value={counts.critical} subtitle="Needs immediate review" icon={AlertTriangle} />
          <StatCard title="Front Desk Queue" value={counts.sameDay} subtitle="Can be actioned by front desk" icon={Clock3} />
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
          urgencyFilter={urgencyFilter}
          setUrgencyFilter={setUrgencyFilter}
          tab={tab}
          setTab={setTab}
        />

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center text-sm text-slate-500 shadow-sm">
            Loading voicemail dataset from SQLite...
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <VoicemailInbox
              filtered={filtered}
              selectedGroupId={selectedGroup?.id}
              selectedVoicemailId={selected?.selectedVoicemailId ?? selectedGroup?.latestVoicemailId ?? null}
              onSelectVoicemail={handleSelectVoicemail}
            />
            <VoicemailDetails
              selected={selected}
              queues={availableQueues}
              updateItem={updateItem}
              isSaving={savingId === selected?.id}
            />
          </div>
        )}
      </div>
    </div>
  );
}
