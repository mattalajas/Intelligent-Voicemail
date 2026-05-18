export async function fetchVoicemails() {
  const response = await fetch("/api/voicemails");
  if (!response.ok) {
    throw new Error("Failed to load voicemails");
  }

  const data = await response.json();
  return data.items;
}

export async function fetchQueues() {
  const response = await fetch("/api/queues");
  if (!response.ok) {
    throw new Error("Failed to load queues");
  }

  const data = await response.json();
  return data.items;
}

export async function patchVoicemail(id, patch) {
  const response = await fetch(`/api/voicemails/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(patch),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to update voicemail");
  }

  const data = await response.json();
  return data.item;
}

export async function transcribeAudioFileWithGemini(file, { model, prompt, displayName, callerPhone, clinicId } = {}) {
  if (!(file instanceof Blob)) {
    throw new Error("A browser File or Blob is required");
  }

  const params = new URLSearchParams();
  if (model) {
    params.set("model", model);
  }
  if (prompt) {
    params.set("prompt", prompt);
  }
  if (displayName) {
    params.set("displayName", displayName);
  }
  if (callerPhone) {
    params.set("callerPhone", callerPhone);
  }
  if (clinicId) {
    params.set("clinicId", String(clinicId));
  }

  const requestUrl = params.size
    ? `/api/transcriptions/gemini-upload?${params.toString()}`
    : "/api/transcriptions/gemini-upload";

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type": file.type || "application/octet-stream",
      "X-File-Name": "name" in file && file.name ? file.name : displayName || "uploaded-audio",
    },
    body: file,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to upload and transcribe audio");
  }

  const data = await response.json();
  return data;
}

export async function retranscribeVoicemailWithGemini(voicemailId, { model, prompt } = {}) {
  const params = new URLSearchParams();
  if (model) {
    params.set("model", model);
  }

  const requestUrl = params.size
    ? `/api/voicemails/${encodeURIComponent(voicemailId)}/retranscribe?${params.toString()}`
    : `/api/voicemails/${encodeURIComponent(voicemailId)}/retranscribe`;

  const response = await fetch(requestUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
    }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Failed to retranscribe voicemail");
  }

  const data = await response.json();
  return data;
}
