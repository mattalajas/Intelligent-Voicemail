import React from "react";
import { ChevronRight, ClipboardList, UserRound } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { queueIcons, statusStyles, urgencyStyles } from "./constants";

export function VoicemailInbox({ filtered, selectedId, setSelectedId }) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-lg">
          <span>Voicemail inbox</span>
          <span className="text-sm font-normal text-slate-500">{filtered.length} items shown</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {filtered.map((item) => {
          const QueueIcon = queueIcons[item.queue] || ClipboardList;
          const isActive = selectedId === item.id;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedId(item.id)}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                isActive ? "border-slate-900 bg-slate-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
              }`}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge className={urgencyStyles[item.urgency]}>{item.urgency}</Badge>
                    <Badge variant="outline">{item.queue}</Badge>
                    <Badge className={statusStyles[item.status]}>{item.status}</Badge>
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <UserRound className="h-4 w-4 text-slate-400" />
                      <p className="font-medium text-slate-900">{item.patient}</p>
                      <span className="text-sm text-slate-400">&bull;</span>
                      <p className="text-sm text-slate-500">{item.location}</p>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">{item.reason}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-4 text-sm text-slate-500">
                    <div className="flex items-center gap-1">
                      <QueueIcon className="h-4 w-4" /> {item.owner}
                    </div>
                    <div>{item.time}</div>
                    <div>{item.intent}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <span>{item.age}</span>
                  <ChevronRight className="h-4 w-4" />
                </div>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-10 text-center text-sm text-slate-500">
            No items match the current filters.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
