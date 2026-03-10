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
