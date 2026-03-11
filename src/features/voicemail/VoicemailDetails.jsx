import React from "react";
import { Pencil, Phone, Play, RefreshCw } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import {
  getOwnerLabelStyle,
  getOwnerRecommendationBoxStyle,
  statusActionStyles,
  statusStyles,
  urgencyStyles,
} from "./constants";

export function VoicemailDetails({ selected, queues, updateItem, isSaving }) {
  const relatedHistory = selected?.history?.filter((entry) => entry.voicemailId !== selected.selectedVoicemailId) ?? [];
  const hasUrgencyKeywordMatches = (selected?.matchedUrgencyKeywords?.length ?? 0) > 0;
  const hasPatientUrgencyMarker = Boolean(selected?.patientUrgencyMarker);
  const hasTranscriptSnapshot = Boolean(selected?.hasTranscriptSnapshot);

  function formatDateOfBirth(dateOfBirth) {
    if (!dateOfBirth) {
      return "";
    }

    const parsedDate = new Date(dateOfBirth);
    if (Number.isNaN(parsedDate.getTime())) {
      return dateOfBirth;
    }

    return parsedDate.toLocaleDateString("en-NZ", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function formatIntentScore(score) {
    return `${Math.round((score ?? 0) * 100)}%`;
  }

  function formatUrgencyKeywordMatch(match) {
    return `${match.keyword} (${match.urgency}, ${formatIntentScore(match.score)})`;
  }

  function renderPrimaryIntent(intentLabel, score) {
    if (intentLabel === "Unknown") {
      return intentLabel;
    }

    return `${intentLabel} (${formatIntentScore(score)})`;
  }

  function getStatusNoteMeta(status) {
    if (status === "Resolved") {
      return {
        label: "Resolution note",
        prompt: "Enter how this call was resolved:",
        emptyMessage: "A resolution reason is required before resolving this case.",
        cardClassName: "border-emerald-200 bg-emerald-50",
        labelClassName: "text-emerald-700",
        bodyClassName: "text-emerald-900",
      };
    }

    return {
      label: "In progress note",
      prompt: "Enter the current progress note for this call:",
      emptyMessage: "A progress note is required before moving this case to in progress.",
      cardClassName: "border-amber-200 bg-amber-50",
      labelClassName: "text-amber-700",
      bodyClassName: "text-amber-900",
    };
  }

  function handleStatusChange(nextStatus) {
    if (!selected || isSaving || nextStatus === selected.status) {
      return;
    }

    if (
      selected.status === "Resolved" &&
      nextStatus !== "Resolved" &&
      !window.confirm("This case is already resolved. Reopen it and continue?")
    ) {
      return;
    }

    if (nextStatus === "Resolved" || nextStatus === "In Progress") {
      const noteMeta = getStatusNoteMeta(nextStatus);
      const note = window.prompt(noteMeta.prompt, selected.resolutionNote || "");
      if (note == null) {
        return;
      }

      const trimmedNote = note.trim();
      if (!trimmedNote) {
        window.alert(noteMeta.emptyMessage);
        return;
      }

      updateItem(selected.id, { status: nextStatus, resolutionNote: trimmedNote });
      return;
    }

    updateItem(selected.id, { status: nextStatus });
  }

  function handleEditResolutionNote() {
    if (!selected || isSaving || !["Resolved", "In Progress"].includes(selected.status)) {
      return;
    }

    const noteMeta = getStatusNoteMeta(selected.status);
    const note = window.prompt(`Edit ${noteMeta.label.toLowerCase()}:`, selected.resolutionNote || "");
    if (note == null) {
      return;
    }

    const trimmedNote = note.trim();
    if (!trimmedNote) {
      window.alert(`A ${noteMeta.label.toLowerCase()} cannot be blank while the case is ${selected.status.toLowerCase()}.`);
      return;
    }

    updateItem(selected.id, { resolutionNote: trimmedNote });
  }

  function getStatusActionClassName(status) {
    const tone = statusActionStyles[status];
    if (!tone) {
      return "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50";
    }

    return selected?.status === status ? tone.active : tone.inactive;
  }

  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Voicemail details</CardTitle>
      </CardHeader>
      <CardContent>
        {selected ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={urgencyStyles[selected.urgency]}>{selected.urgency}</Badge>
              <Badge className={statusStyles[selected.status]}>{selected.status}</Badge>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-900">{selected.patient}</h2>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
                <span>{selected.phone}</span>
                {selected.patientDateOfBirth && <span>DOB: {formatDateOfBirth(selected.patientDateOfBirth)}</span>}
                <span>{selected.location}</span>
                <span>{selected.time}</span>
              </div>
              {selected.isHistoricalSelection && (
                <p className="mt-2 text-xs font-medium italic tracking-wide text-slate-500">
                  Viewing an earlier voicemail.
                </p>
              )}
            </div>
            <hr />
            <div className="grid gap-0 sm:grid-cols-1">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Voicemail Summary</p>
                <p className="mt-1 text-xs text-slate-500">
                  Transcript confidence: {selected.transcriptionConfidence}
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900">{selected.summary}</p>
                {!hasTranscriptSnapshot && (
                  <p className="mt-2 text-sm text-amber-700">
                    AI transcription is currently unavailable for this voicemail. Caller details are still shown from the matched patient record.
                  </p>
                )}
                <p className="mt-2 text-sm text-slate-700">
                  Primary intent: {renderPrimaryIntent(selected.intent, selected.primaryIntentScore)}
                </p>
              </div>
              <div className="rounded-2xl p-4">
                {selected.intents?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium tracking-wide text-slate-500">
                      Intents above {formatIntentScore(selected.intentThreshold)}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {selected.intents.map((intent) => (
                        <Badge key={intent.intentId} variant="secondary">
                          {intent.label} {formatIntentScore(intent.score)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:grid-rows-2">
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Primary GP</p>
                <p className="mt-2 text-sm font-medium text-slate-900">{selected.primaryGp || "Unassigned"}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 row-span-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Recommended next step</p>
                <p className="mt-2 text-sm font-medium text-slate-900">{selected.nextStep}</p>
                {hasPatientUrgencyMarker && (
                  <p className="mt-2 text-sm text-slate-700">
                    GP urgency marker: {selected.patientUrgencyMarker.urgency} by {selected.patientUrgencyMarker.gpName}
                    {selected.patientUrgencyMarker.note ? ` - ${selected.patientUrgencyMarker.note}` : ""}
                  </p>
                )}
                {hasUrgencyKeywordMatches && (
                  <p className="mt-2 text-sm text-slate-700">
                    Urgency keyword similarity {"\u2265"} 60%: {selected.matchedUrgencyKeywords.map(formatUrgencyKeywordMatch).join(", ")}
                  </p>
                )}
                {!hasUrgencyKeywordMatches && !hasPatientUrgencyMarker && (
                  <p className="mt-2 text-sm text-slate-700">
                    No urgency keyword similarity {"\u2265"} 60% and no GP urgency marker found. Urgency classified as{" "}
                    {selected.urgency}.
                  </p>
                )}
              </div>
              <div
                className={`rounded-2xl border p-4 ${getOwnerRecommendationBoxStyle(selected.assignedGp || selected.owner)}`}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Queue recommendation</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <Badge className={getOwnerLabelStyle(selected.assignedGp || selected.owner)}>
                    {selected.assignedGp || selected.owner}
                  </Badge>
                </div>
                <p className="mt-2 text-sm text-slate-700">Queue reason: {selected.queue}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Caller history</p>
              <p className="mt-2 text-sm font-medium text-slate-900">{selected.historicalContext}</p>
            </div>

            {selected.resolutionNote && ["Resolved", "In Progress"].includes(selected.status) && (
              <div className={`rounded-2xl border p-4 ${getStatusNoteMeta(selected.status).cardClassName}`}>
                <div className="flex items-start justify-between gap-3">
                  <p className={`text-xs font-medium uppercase tracking-wide ${getStatusNoteMeta(selected.status).labelClassName}`}>
                    {getStatusNoteMeta(selected.status).label}
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleEditResolutionNote}
                    disabled={isSaving || !["Resolved", "In Progress"].includes(selected.status)}
                  >
                    <Pencil className="mr-2 h-4 w-4" /> Edit
                  </Button>
                </div>
                <p className={`mt-2 text-sm ${getStatusNoteMeta(selected.status).bodyClassName}`}>{selected.resolutionNote}</p>
              </div>
            )}
            <hr />
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Transcript snapshot</p>
              {hasTranscriptSnapshot && <p className="mt-3 text-sm leading-6 text-slate-700">"{selected.transcript}"</p>}
              <div className="mt-3 flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <Play className="mr-2 h-4 w-4" /> Play audio
                </Button>
                {!hasTranscriptSnapshot && (
                  <Button variant="outline" size="sm" onClick={() => {}}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Refresh AI
                  </Button>
                )}
              </div>
            </div>

            {relatedHistory.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Other voicemails from this number</p>
                <div className="mt-3 space-y-3">
                  {relatedHistory.map((entry) => (
                    <div key={entry.voicemailId} className="rounded-2xl bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge className={urgencyStyles[entry.urgency]}>{entry.urgency}</Badge>
                        <Badge className={statusStyles[entry.status]}>{entry.status}</Badge>
                        <span className="text-xs text-slate-500">{entry.time}</span>
                        <span className="text-xs text-slate-500">{entry.age}</span>
                      </div>
                      <p className="mt-2 text-sm font-medium text-slate-900">{entry.reason}</p>
                      <p className="mt-1 text-sm text-slate-600">{entry.summary}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Primary intent: {entry.intent} ({formatIntentScore(entry.primaryIntentScore)}) | Transcript confidence: {entry.transcriptionConfidence}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Management actions</p>
                {isSaving && <span className="text-xs text-slate-500">Saving to SQLite...</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  onClick={() => handleStatusChange("New")}
                  className={getStatusActionClassName("New")}
                  disabled={isSaving}
                >
                  New
                </Button>
                <Button
                  onClick={() => handleStatusChange("In Progress")}
                  className={getStatusActionClassName("In Progress")}
                  disabled={isSaving}
                >
                  In progress
                </Button>
                <Button
                  onClick={() => handleStatusChange("Resolved")}
                  className={getStatusActionClassName("Resolved")}
                  disabled={isSaving}
                >
                  Resolved
                </Button> 
              </div>
              <div className="mt-3 flex items-center justify-between gap-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Queue actions</p>
              </div>
              <div className="mt-3">
                <select
                  value={selected.queue}
                  onChange={(event) => {
                    const nextQueue = event.target.value;
                    if (nextQueue !== selected.queue) {
                      updateItem(selected.id, { queue: nextQueue });
                    }
                  }}
                  disabled={isSaving}
                  className="h-10 w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {queues.map((queue) => (
                    <option key={queue} value={queue}>
                      {queue}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
            Select a voicemail item to view details.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
