import React, { useEffect, useRef, useMemo, useState } from "react";
import { AlertTriangle, Clock3, ClipboardList, Loader2, MessageSquareText, Mic, Square, Upload } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { StatCard } from "./StatCard";
import { VoicemailDetails } from "./VoicemailDetails";
import { VoicemailFilters } from "./VoicemailFilters";
import { VoicemailInbox } from "./VoicemailInbox";
import { fetchQueues, fetchVoicemails, patchVoicemail, retranscribeVoicemailWithGemini, transcribeAudioFileWithGemini } from "./api";
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
    machineUrgency: selectedEntry.machineUrgency,
    machineUrgencySource: selectedEntry.machineUrgencySource,
    isUrgencyManuallyOverridden: selectedEntry.isUrgencyManuallyOverridden,
    matchedUrgencyKeywords: selectedEntry.matchedUrgencyKeywords,
    patientUrgencyMarker: selectedEntry.patientUrgencyMarker,
    reason: selectedEntry.reason,
    summary: selectedEntry.summary,
    transcript: selectedEntry.transcript,
    audioUrl: selectedEntry.audioUrl,
    hasTranscriptSnapshot: selectedEntry.hasTranscriptSnapshot,
    transcriptionConfidence: selectedEntry.transcriptionConfidence,
    nextStep: selectedEntry.nextStep,
  };
}

export default function VoicemailPrototype() {
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
  const [retranscribingVoicemailId, setRetranscribingVoicemailId] = useState("");
  const [uploadPhone, setUploadPhone] = useState("");
  const [uploadClinicId, setUploadClinicId] = useState("1");
  const [isRecording, setIsRecording] = useState(false);
  const [isUploadingTranscript, setIsUploadingTranscript] = useState(false);
  const fileInputRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const mediaStreamRef = useRef(null);
  const audioChunksRef = useRef([]);

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

  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
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

  async function reloadVoicemailsAndSelect(callerPhone) {
    const [nextItems, nextQueues] = await Promise.all([fetchVoicemails(), fetchQueues()]);
    setItems(nextItems);
    setQueues(nextQueues);

    const matchingItem = nextItems.find((item) => item.id === callerPhone) ?? nextItems[0] ?? null;
    if (matchingItem) {
      setSelectedGroupId(matchingItem.id);
      setSelectedVoicemailId(matchingItem.latestVoicemailId);
    }
  }

  async function handleRetranscribeVoicemail(voicemailId, callerPhone) {
    if (!voicemailId) {
      return;
    }

    try {
      setRetranscribingVoicemailId(voicemailId);
      setError("");
      await retranscribeVoicemailWithGemini(voicemailId);
      const [nextItems, nextQueues] = await Promise.all([fetchVoicemails(), fetchQueues()]);
      setItems(nextItems);
      setQueues(nextQueues);

      const matchingItem = nextItems.find((item) => item.id === callerPhone) ?? nextItems[0] ?? null;
      if (matchingItem) {
        setSelectedGroupId(matchingItem.id);
        setSelectedVoicemailId(voicemailId);
      }
    } catch (retranscribeError) {
      setError(retranscribeError.message || "Unable to run Gemini inference again on this voicemail");
    } finally {
      setRetranscribingVoicemailId("");
    }
  }

  async function uploadTranscriptAudio(file) {
    const normalizedPhone = uploadPhone.trim();
    if (!normalizedPhone) {
      setError("Phone number is required before uploading or recording audio.");
      return;
    }

    setIsUploadingTranscript(true);
    setError("");

    try {
      const result = await transcribeAudioFileWithGemini(file, {
        callerPhone: normalizedPhone,
        clinicId: uploadClinicId,
        displayName: "name" in file && file.name ? file.name : undefined,
      });
      await reloadVoicemailsAndSelect(result.item?.id || normalizedPhone);
    } catch (uploadError) {
      setError(uploadError.message || "Unable to transcribe and save voicemail");
    } finally {
      setIsUploadingTranscript(false);
    }
  }

  async function handleAudioFileSelection(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    await uploadTranscriptAudio(file);
  }

  async function handleStartRecording() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      setError("This browser does not support audio recording.");
      return;
    }

    if (!uploadPhone.trim()) {
      setError("Phone number is required before recording audio.");
      return;
    }

    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      audioChunksRef.current = [];

      const preferredMimeTypes = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
      const supportedMimeType = preferredMimeTypes.find((mimeType) => MediaRecorder.isTypeSupported?.(mimeType));
      const recorder = supportedMimeType ? new MediaRecorder(stream, { mimeType: supportedMimeType }) : new MediaRecorder(stream);

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      });

      recorder.addEventListener("stop", async () => {
        const blob = new Blob(audioChunksRef.current, {
          type: recorder.mimeType || "audio/webm",
        });
        const extension = blob.type.includes("mp4") ? "m4a" : "webm";
        const file = new File([blob], `recording-${Date.now()}.${extension}`, {
          type: blob.type || "audio/webm",
        });

        audioChunksRef.current = [];
        mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
        mediaStreamRef.current = null;
        mediaRecorderRef.current = null;
        setIsRecording(false);

        if (blob.size > 0) {
          await uploadTranscriptAudio(file);
        }
      });

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecording(true);
    } catch (recordingError) {
      setError(recordingError.message || "Unable to start recording");
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      setIsRecording(false);
    }
  }

  function handleStopRecording() {
    if (!mediaRecorderRef.current || mediaRecorderRef.current.state === "inactive") {
      return;
    }

    mediaRecorderRef.current.stop();
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-slate-500">Heidi Calls - Harbour to Sunset GP</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Morning Voicemail Dashboard</h1>
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
          <StatCard title="Admin Queue" value={counts.sameDay} subtitle="Admin specific work" icon={Clock3} />
          <StatCard title="Open work" value={counts.unresolved} subtitle="New or in progress" icon={ClipboardList} />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
            <div className="grid flex-1 gap-3 md:grid-cols-[1fr_220px]">
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Caller phone</p>
                <Input
                  value={uploadPhone}
                  onChange={(event) => setUploadPhone(event.target.value)}
                  placeholder="e.g. 021 555 000"
                />
              </div>
              <div>
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500">Clinic</p>
                <select
                  value={uploadClinicId}
                  onChange={(event) => setUploadClinicId(event.target.value)}
                  className="flex h-10 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-300"
                >
                  <option value="1">Harbour Central</option>
                  <option value="2">Harbour South</option>
                  <option value="3">Sunset West</option>
                </select>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              {!isRecording ? (
                <Button onClick={handleStartRecording} disabled={isUploadingTranscript}>
                  <Mic className="mr-2 h-4 w-4" /> Record voicemail
                </Button>
              ) : (
                <Button onClick={handleStopRecording} className="border border-red-600 bg-red-600 text-white hover:bg-red-500">
                  <Square className="mr-2 h-4 w-4" /> Stop and save
                </Button>
              )}
              <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploadingTranscript || isRecording}>
                <Upload className="mr-2 h-4 w-4" /> Upload audio
              </Button>
              <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleAudioFileSelection} />
            </div>
          </div>
          {isUploadingTranscript && (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Transcribing with Gemini and saving to the voicemail dashboard...</span>
              </div>
            </div>
          )}
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
              isRetranscribing={retranscribingVoicemailId === selected?.selectedVoicemailId}
              retranscribeVoicemail={handleRetranscribeVoicemail}
            />
          </div>
        )}
      </div>
    </div>
  );
}
