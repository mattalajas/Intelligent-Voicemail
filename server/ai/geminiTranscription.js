import { basename, extname, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

function loadEnvFile() {
  const envFilePath = path.resolve(process.cwd(), ".env");
  if (!existsSync(envFilePath)) {
    return;
  }

  const envLines = readFileSync(envFilePath, "utf8").split(/\r?\n/);
  for (const rawLine of envLines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] != null) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}

loadEnvFile();

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com";
export const GEMINI_TRANSCRIPTION_MODEL = process.env.GEMINI_TRANSCRIPTION_MODEL || "gemini-3-flash-preview";
export const DEFAULT_GEMINI_TRANSCRIPTION_PROMPT = "Generate a verbatim transcript of the speech in this audio file.";

function buildClinicVoicemailAnalysisPrompt({ intents = [], urgencyKeywords = [] } = {}) {
  const formattedIntents = intents.map((intent) => intent.label).join(", ");
  const formattedUrgencyKeywords = urgencyKeywords
    .map((keyword) => `${keyword.keyword} (${keyword.urgency})`)
    .join(", ");

  return `You are an intelligent transcription agent for a healthcare clinic. Process the audio file and generate a detailed transcription.

  Requirements:
  1. Provide a full transcription and a concise summary of the entire audio.
  2. Provide a short description on the reason for calling.
  3. Provide the recommended next steps in 3-5 words.
  4. Individually classify the voicemail between 0-100, under these intents: ${formattedIntents}
  5. Individually match the voicemail between 0-100, under similarities to the urgency keywords: ${formattedUrgencyKeywords}`;
}

function buildClinicVoicemailAnalysisSchema() {
  return {
    type: "OBJECT",
    properties: {
      transcription: {
        type: "STRING",
      },
      summary: {
        type: "STRING",
      },
      reasonForCall: {
        type: "STRING",
      },
      recommendedNextSteps: {
        type: "STRING",
      },
      intents: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            label: { type: "STRING" },
            score: { type: "NUMBER" },
          },
          required: ["label", "score"],
        },
      },
      urgencyKeywords: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            keyword: { type: "STRING" },
            urgency: { type: "STRING" },
            score: { type: "NUMBER" },
          },
          required: ["keyword", "urgency", "score"],
        },
      },
    },
    required: ["transcription", "summary", "reasonForCall", "recommendedNextSteps", "intents", "urgencyKeywords"],
  };
}

const mimeTypeByExtension = {
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".m4a": "audio/mp4",
  ".mp3": "audio/mpeg",
  ".mp4": "audio/mp4",
  ".oga": "audio/ogg",
  ".ogg": "audio/ogg",
  ".opus": "audio/opus",
  ".wav": "audio/wav",
  ".webm": "audio/webm",
};

function resolveGeminiApiKey(apiKey) {
  const resolvedApiKey = String(apiKey || process.env.GEMINI_API_KEY || process.env.GEMINI_KEY || "").trim();
  if (!resolvedApiKey) {
    throw new Error("GEMINI_API_KEY or GEMINI_KEY is required to transcribe audio with Gemini");
  }

  return resolvedApiKey;
}

function inferAudioMimeType(audioPath, providedMimeType) {
  if (providedMimeType) {
    return providedMimeType;
  }

  const extension = extname(audioPath).toLowerCase();
  const inferredMimeType = mimeTypeByExtension[extension];

  if (!inferredMimeType) {
    throw new Error(`Unable to infer MIME type for audio file: ${audioPath}`);
  }

  return inferredMimeType;
}

async function uploadAudioBytesToGemini({ audioBytes, mimeType, apiKey, displayName }) {
  const resolvedApiKey = resolveGeminiApiKey(apiKey);
  const resolvedAudioBytes = Buffer.isBuffer(audioBytes) ? audioBytes : Buffer.from(audioBytes);

  const startUploadResponse = await fetch(`${GEMINI_API_BASE_URL}/upload/v1beta/files`, {
    method: "POST",
    headers: {
      "x-goog-api-key": resolvedApiKey,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(resolvedAudioBytes.byteLength),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      file: {
        display_name: displayName,
      },
    }),
  });

  if (!startUploadResponse.ok) {
    const errorBody = await startUploadResponse.text();
    throw new Error(`Gemini upload start failed: ${startUploadResponse.status} ${errorBody}`);
  }

  const uploadUrl = startUploadResponse.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new Error("Gemini upload start did not return an upload URL");
  }

  const finalizeUploadResponse = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(resolvedAudioBytes.byteLength),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body: resolvedAudioBytes,
  });

  if (!finalizeUploadResponse.ok) {
    const errorBody = await finalizeUploadResponse.text();
    throw new Error(`Gemini file upload failed: ${finalizeUploadResponse.status} ${errorBody}`);
  }

  const fileInfo = await finalizeUploadResponse.json();
  const fileUri = fileInfo?.file?.uri;
  const uploadedMimeType = fileInfo?.file?.mimeType || mimeType;

  if (!fileUri) {
    throw new Error("Gemini file upload completed without a file URI");
  }

  return {
    fileUri,
    mimeType: uploadedMimeType,
    fileInfo,
  };
}

function extractTranscriptText(generateContentResponse) {
  const parts = generateContentResponse?.candidates?.[0]?.content?.parts ?? [];
  const transcript = parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();

  if (!transcript) {
    throw new Error("Gemini returned no transcript text");
  }

  return transcript;
}

function extractResponseText(generateContentResponse) {
  const parts = generateContentResponse?.candidates?.[0]?.content?.parts ?? [];
  const responseText = parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("\n")
    .trim();

  if (!responseText) {
    throw new Error("Gemini returned no response text");
  }

  return responseText;
}

function extractJsonObject(responseText) {
  const fencedMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const candidate = fencedMatch?.[1]?.trim() || responseText.trim();
  const firstBraceIndex = candidate.indexOf("{");
  const lastBraceIndex = candidate.lastIndexOf("}");

  if (firstBraceIndex === -1 || lastBraceIndex === -1 || lastBraceIndex < firstBraceIndex) {
    throw new Error("Gemini did not return a JSON object");
  }

  return candidate.slice(firstBraceIndex, lastBraceIndex + 1);
}

function normalizeScoreToUnitInterval(score) {
  const numericScore = Number(score);
  if (!Number.isFinite(numericScore)) {
    return 0;
  }

  if (numericScore <= 1) {
    return Math.max(0, Math.min(1, Number(numericScore.toFixed(2))));
  }

  return Math.max(0, Math.min(1, Number((numericScore / 100).toFixed(2))));
}

function normalizeMockAnalysisPayload(payload, model, mimeType) {
  const transcription = String(payload?.transcription || payload?.transcript || "").trim();
  if (!transcription) {
    throw new Error("Mock Gemini analysis must include a transcription");
  }

  return {
    model,
    mimeType,
    fileUri: "mock://gemini-analysis",
    rawResponse: payload,
    prompt: payload?.prompt ?? null,
    transcription,
    transcript: transcription,
    summary: String(payload?.summary || "").trim() || transcription,
    reasonForCall: String(payload?.reasonForCall || "").trim() || "Reason for call unavailable.",
    recommendedNextSteps: String(payload?.recommendedNextSteps || "").trim() || "Review voicemail",
    intents: Array.isArray(payload?.intents)
      ? payload.intents.map((intent) => ({
          label: String(intent?.label || "").trim(),
          score: normalizeScoreToUnitInterval(intent?.score),
        }))
      : [],
    urgencyKeywords: Array.isArray(payload?.urgencyKeywords)
      ? payload.urgencyKeywords.map((keyword) => ({
          keyword: String(keyword?.keyword || "").trim().toLowerCase(),
          urgency: String(keyword?.urgency || "").trim(),
          score: normalizeScoreToUnitInterval(keyword?.score),
        }))
      : [],
  };
}

function resolveMockGeminiAnalysis(model, mimeType) {
  const mockAnalysisPath = String(process.env.GEMINI_MOCK_ANALYSIS_PATH || "").trim();
  const mockAnalysisJson = String(process.env.GEMINI_MOCK_ANALYSIS_JSON || "").trim();

  if (!mockAnalysisPath && !mockAnalysisJson) {
    return null;
  }

  const payload = mockAnalysisPath
    ? JSON.parse(readFileSync(resolve(process.cwd(), mockAnalysisPath), "utf8"))
    : JSON.parse(mockAnalysisJson);

  return normalizeMockAnalysisPayload(payload, model, mimeType);
}

function parseVoicemailAnalysisResponse(generateContentResponse) {
  const responseText = extractResponseText(generateContentResponse);
  const parsed = JSON.parse(extractJsonObject(responseText));
  const transcription = String(parsed?.transcription || "").trim();

  if (!transcription) {
    throw new Error("Gemini returned no transcription");
  }

  return {
    transcription,
    summary: String(parsed?.summary || "").trim() || transcription,
    reasonForCall: String(parsed?.reasonForCall || "").trim() || "Reason for call unavailable.",
    recommendedNextSteps: String(parsed?.recommendedNextSteps || "").trim() || "Review voicemail",
    intents: Array.isArray(parsed?.intents)
      ? parsed.intents.map((intent) => ({
          label: String(intent?.label || "").trim(),
          score: normalizeScoreToUnitInterval(intent?.score),
        }))
      : [],
    urgencyKeywords: Array.isArray(parsed?.urgencyKeywords)
      ? parsed.urgencyKeywords.map((keyword) => ({
          keyword: String(keyword?.keyword || "").trim().toLowerCase(),
          urgency: String(keyword?.urgency || "").trim(),
          score: normalizeScoreToUnitInterval(keyword?.score),
        }))
      : [],
    rawText: responseText,
  };
}

export async function transcribeAudioWithGemini({
  audioPath,
  mimeType,
  apiKey,
  model = GEMINI_TRANSCRIPTION_MODEL,
  prompt = DEFAULT_GEMINI_TRANSCRIPTION_PROMPT,
  displayName,
} = {}) {
  const resolvedAudioPath = String(audioPath || "").trim();
  if (!resolvedAudioPath) {
    throw new Error("audioPath is required");
  }

  const resolvedMimeType = inferAudioMimeType(resolvedAudioPath, mimeType);
  const resolvedApiKey = resolveGeminiApiKey(apiKey);
  const resolvedDisplayName = displayName || basename(resolvedAudioPath);
  const audioBytes = await readFile(resolvedAudioPath);

  return transcribeAudioBufferWithGemini({
    audioBytes,
    mimeType: resolvedMimeType,
    apiKey: resolvedApiKey,
    model,
    prompt,
    displayName: resolvedDisplayName,
  });
}

export async function transcribeAudioBufferWithGemini({
  audioBytes,
  mimeType,
  apiKey,
  model = GEMINI_TRANSCRIPTION_MODEL,
  prompt = DEFAULT_GEMINI_TRANSCRIPTION_PROMPT,
  displayName = "uploaded-audio",
} = {}) {
  if (!audioBytes || Buffer.from(audioBytes).byteLength === 0) {
    throw new Error("audioBytes is required");
  }

  const resolvedMimeType = String(mimeType || "").trim();
  if (!resolvedMimeType) {
    throw new Error("mimeType is required");
  }

  const resolvedApiKey = resolveGeminiApiKey(apiKey);
  const uploadedFile = await uploadAudioBytesToGemini({
    audioBytes,
    mimeType: resolvedMimeType,
    apiKey: resolvedApiKey,
    displayName,
  });

  const generateContentResponse = await fetch(
    `${GEMINI_API_BASE_URL}/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "x-goog-api-key": resolvedApiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                file_data: {
                  file_uri: uploadedFile.fileUri,
                  mime_type: uploadedFile.mimeType,
                },
              },
              {
                text: prompt,
              },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: buildClinicVoicemailAnalysisSchema(),
        },
      }),
    },
  );

  if (!generateContentResponse.ok) {
    const errorBody = await generateContentResponse.text();
    throw new Error(`Gemini transcription request failed: ${generateContentResponse.status} ${errorBody}`);
  }

  const responseJson = await generateContentResponse.json();
  const transcript = extractTranscriptText(responseJson);

  return {
    model,
    transcript,
    mimeType: uploadedFile.mimeType,
    fileUri: uploadedFile.fileUri,
    rawResponse: responseJson,
  };
}

export async function analyzeAudioBufferWithGemini({
  audioBytes,
  mimeType,
  apiKey,
  model = GEMINI_TRANSCRIPTION_MODEL,
  intents = [],
  urgencyKeywords = [],
  prompt,
  displayName = "uploaded-audio",
} = {}) {
  const resolvedMimeType = String(mimeType || "").trim();
  const mockAnalysis = resolveMockGeminiAnalysis(model, resolvedMimeType || "audio/mock");
  if (mockAnalysis) {
    return mockAnalysis;
  }

  const resolvedPrompt = prompt || buildClinicVoicemailAnalysisPrompt({ intents, urgencyKeywords });
  const transcription = await transcribeAudioBufferWithGemini({
    audioBytes,
    mimeType,
    apiKey,
    model,
    prompt: resolvedPrompt,
    displayName,
  });

  const parsedAnalysis = parseVoicemailAnalysisResponse(transcription.rawResponse);

  return {
    model,
    mimeType: transcription.mimeType,
    fileUri: transcription.fileUri,
    rawResponse: transcription.rawResponse,
    prompt: resolvedPrompt,
    transcription: parsedAnalysis.transcription,
    transcript: parsedAnalysis.transcription,
    summary: parsedAnalysis.summary,
    reasonForCall: parsedAnalysis.reasonForCall,
    recommendedNextSteps: parsedAnalysis.recommendedNextSteps,
    intents: parsedAnalysis.intents,
    urgencyKeywords: parsedAnalysis.urgencyKeywords,
  };
}

export async function analyzeAudioWithGemini({
  audioPath,
  mimeType,
  apiKey,
  model = GEMINI_TRANSCRIPTION_MODEL,
  intents = [],
  urgencyKeywords = [],
  prompt,
  displayName,
} = {}) {
  const resolvedAudioPath = String(audioPath || "").trim();
  if (!resolvedAudioPath) {
    throw new Error("audioPath is required");
  }

  const resolvedMimeType = inferAudioMimeType(resolvedAudioPath, mimeType);
  const mockAnalysis = resolveMockGeminiAnalysis(model, resolvedMimeType);
  if (mockAnalysis) {
    return mockAnalysis;
  }

  const resolvedApiKey = resolveGeminiApiKey(apiKey);
  const resolvedDisplayName = displayName || basename(resolvedAudioPath);
  const audioBytes = await readFile(resolvedAudioPath);

  return analyzeAudioBufferWithGemini({
    audioBytes,
    mimeType: resolvedMimeType,
    apiKey: resolvedApiKey,
    model,
    intents,
    urgencyKeywords,
    prompt,
    displayName: resolvedDisplayName,
  });
}
