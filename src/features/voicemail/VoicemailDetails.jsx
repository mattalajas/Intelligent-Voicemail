import React from "react";
import { CheckCircle2, Phone, Play } from "lucide-react";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import { statusStyles, urgencyStyles } from "./constants";

export function VoicemailDetails({ selected, updateItem }) {
  return (
    <Card className="rounded-2xl shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Structured item details</CardTitle>
      </CardHeader>
      <CardContent>
        {selected ? (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className={urgencyStyles[selected.urgency]}>{selected.urgency}</Badge>
              <Badge variant="outline">{selected.queue}</Badge>
              <Badge className={statusStyles[selected.status]}>{selected.status}</Badge>
              <Badge variant="secondary">Confidence: {selected.confidence}</Badge>
            </div>

            <div>
              <h2 className="text-2xl font-semibold text-slate-900">{selected.patient}</h2>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
                <span>{selected.phone}</span>
                <span>{selected.location}</span>
                <span>{selected.time}</span>
                <span>{selected.intent}</span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">What matters</p>
                <p className="mt-2 text-sm text-slate-700">{selected.summary}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Recommended next step</p>
                <p className="mt-2 text-sm font-medium text-slate-900">{selected.nextStep}</p>
                <p className="mt-2 text-sm text-slate-600">Owner: {selected.owner}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Transcript snapshot</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">"{selected.transcript}"</p>
              <div className="mt-3 flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <Play className="mr-2 h-4 w-4" /> Play audio
                </Button>
                <Button variant="outline" size="sm">
                  <Phone className="mr-2 h-4 w-4" /> Return call
                </Button>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Management actions</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button onClick={() => updateItem(selected.id, { status: "New" })} variant="outline">
                  Mark new
                </Button>
                <Button onClick={() => updateItem(selected.id, { status: "In Progress" })} variant="outline">
                  Start work
                </Button>
                <Button onClick={() => updateItem(selected.id, { status: "Resolved" })}>
                  <CheckCircle2 className="mr-2 h-4 w-4" /> Resolve
                </Button>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  onClick={() => updateItem(selected.id, { queue: "Clinical Triage", owner: "Nurse triage" })}
                  variant="secondary"
                >
                  Send to nurse triage
                </Button>
                <Button
                  onClick={() =>
                    updateItem(selected.id, {
                      queue: "Same-Day Appointments",
                      owner: "Front desk",
                      nextStep: "Offer same-day GP slot",
                    })
                  }
                  variant="secondary"
                >
                  Book same-day slot
                </Button>
                <Button
                  onClick={() =>
                    updateItem(selected.id, {
                      queue: "GP Callbacks",
                      owner: "Dr Lee",
                      nextStep: "Add to doctor callback list",
                    })
                  }
                  variant="secondary"
                >
                  Assign GP callback
                </Button>
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
