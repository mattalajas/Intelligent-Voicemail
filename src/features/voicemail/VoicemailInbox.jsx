import React, { useEffect, useState } from "react";
import { ChevronRight, ClipboardList, UserRound } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { getOwnerLabelStyle, queueIcons, statusStyles, urgencyStyles } from "./constants";

export function VoicemailInbox({ filtered, selectedGroupId, selectedVoicemailId, onSelectVoicemail }) {
  const [panelHeight, setPanelHeight] = useState(720);
  const [isResizableViewport, setIsResizableViewport] = useState(false);

  useEffect(() => {
    function syncHeightToViewport() {
      const canResize = window.innerWidth >= 1024;
      setIsResizableViewport(canResize);

      if (!canResize) {
        return;
      }

      const nextMaxHeight = Math.max(1024, window.innerHeight - 180);
      setPanelHeight((current) => Math.min(current, nextMaxHeight));
    }

    syncHeightToViewport();
    window.addEventListener("resize", syncHeightToViewport);

    return () => {
      window.removeEventListener("resize", syncHeightToViewport);
    };
  }, []);

  function formatIntentSummary(item) {
    if (!item.intents?.length) {
      return item.intent;
    }

    return item.intents.length > 1 ? `${item.intent} +${item.intents.length - 1} more` : item.intent;
  }

  function handleResizeStart(event) {
    if (!isResizableViewport) {
      return;
    }

    event.preventDefault();

    const startY = event.clientY;
    const startHeight = panelHeight;
    const minHeight = 420;
    const maxHeight = Math.max(1024, window.innerHeight - 180);

    function handlePointerMove(moveEvent) {
      const nextHeight = Math.max(minHeight, Math.min(maxHeight, startHeight + (moveEvent.clientY - startY)));
      setPanelHeight(nextHeight);
    }

    function handlePointerUp() {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    }

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
  }

  return (
    <Card
      className="rounded-2xl shadow-sm lg:flex lg:flex-col lg:overflow-hidden"
      style={isResizableViewport ? { height: `${panelHeight}px` } : undefined}
    >
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <span>Voicemail inbox</span>
          <span className="text-sm font-normal text-slate-500">{filtered.length} items shown</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pr-4">
        {filtered.map((item) => {
          const QueueIcon = queueIcons[item.queue] || ClipboardList;
          const isGroupActive = selectedGroupId === item.id;
          const latestVoicemailId = item.latestVoicemailId ?? item.history?.[0]?.voicemailId ?? null;
          const isLatestActive = isGroupActive && selectedVoicemailId === latestVoicemailId;

          return (
            <div
              key={item.id}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                isGroupActive ? "border-slate-900 bg-slate-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <button
                type="button"
                onClick={() => onSelectVoicemail(item.id, latestVoicemailId)}
                className={`w-full rounded-xl text-left transition ${
                  isLatestActive ? "bg-white shadow-sm" : "hover:bg-slate-50"
                }`}
              >
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className={urgencyStyles[item.urgency]}>{item.urgency}</Badge>
                      <Badge className={statusStyles[item.status]}>{item.status}</Badge>
                      {!item.hasTranscriptSnapshot && (
                        <Badge className="border border-neutral-200 bg-neutral-200 text-neutral-800">AI unavailable</Badge>
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <UserRound className="h-4 w-4 text-slate-400" />
                        <p className="font-medium text-slate-900">{item.patient}</p>
                        <span className="text-sm text-slate-400">&bull;</span>
                        <p className="text-sm text-slate-500">{item.location}</p>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{item.reason}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {item.callCount > 1 ? `${item.callCount} voicemails grouped under ${item.phone}` : item.phone}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
                      <div className="flex items-center gap-1">
                        <QueueIcon className="h-4 w-4" />
                        <Badge className={getOwnerLabelStyle(item.owner)}>{item.owner}</Badge>
                      </div>
                      <div>{item.time}</div>
                      <div>{formatIntentSummary(item)}</div>
                      <div>{item.queue}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <span>{item.age}</span>
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </div>
              </button>

              {isGroupActive && item.history?.length > 1 && (
                <div className="mt-4 border-t border-slate-200 pt-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Earlier voicemails</p>
                  <div className="mt-3 space-y-2">
                    {item.history.slice(1).map((entry) => {
                      const isEntryActive = isGroupActive && selectedVoicemailId === entry.voicemailId;

                      return (
                        <button
                          key={entry.voicemailId}
                          type="button"
                          onClick={() => onSelectVoicemail(item.id, entry.voicemailId)}
                          className={`w-full rounded-xl border p-3 text-left transition ${
                            isEntryActive
                              ? "border-slate-900 bg-white shadow-sm"
                              : "border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white"
                          }`}
                        >
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge className={urgencyStyles[entry.urgency]}>{entry.urgency}</Badge>
                            <Badge className={statusStyles[entry.status]}>{entry.status}</Badge>
                            {!entry.hasTranscriptSnapshot && (
                              <Badge className="border border-amber-200 bg-amber-50 text-amber-800">AI unavailable</Badge>
                            )}
                            <span className="text-xs text-slate-500">{entry.time}</span>
                            <span className="text-xs text-slate-500">{entry.age}</span>
                          </div>
                          <p className="mt-2 text-sm font-medium text-slate-900">{entry.reason}</p>
                          <p className="mt-1 text-sm text-slate-600">{entry.summary}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Intents: {entry.intents?.length > 1 ? `${entry.intent} +${entry.intents.length - 1} more` : entry.intent} |
                            Queue reason: {entry.queue}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
            No items match the current filters.
          </div>
        )}
      </CardContent>
      <div
        role="presentation"
        onPointerDown={handleResizeStart}
        className="hidden h-5 cursor-row-resize touch-none border-t border-slate-200 bg-slate-50 select-none lg:flex lg:items-center lg:justify-center"
      >
        <div className="h-1.5 w-12 rounded-full bg-slate-300" />
      </div>
    </Card>
  );
}
