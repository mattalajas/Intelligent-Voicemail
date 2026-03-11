export const INTENT_CLASSIFICATION_THRESHOLD = 0.6;
export const PROTOTYPE_VOICEMAIL_MODEL = "prototype-voicemail-proxy";

export function scoreToConfidenceLabel(score) {
  if (score >= 0.85) {
    return "High";
  }

  if (score >= 0.65) {
    return "Medium";
  }

  return "Low";
}

function runSummaryStage(input) {
  return {
    stage: "summary_and_reason",
    summary: input.proxy.summary,
    reason: input.proxy.reason,
    transcriptionConfidence: input.proxy.transcriptionConfidence,
    source: "proxy mapping",
  };
}

function runIntentStage(input) {
  const qualifyingIntents = input.intentCandidates
    .filter((candidate) => candidate.score >= input.intentThreshold)
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .map((candidate) => ({
      ...candidate,
      confidence: scoreToConfidenceLabel(candidate.score),
    }));

  const primaryIntent =
    qualifyingIntents[0] ??
    {
      ...input.fallbackIntent,
      confidence: scoreToConfidenceLabel(input.fallbackIntent.score),
    };

  return {
    stage: "intent_classification",
    threshold: input.intentThreshold,
    primaryIntent,
    qualifyingIntents,
    source: qualifyingIntents.length > 0 ? "proxy mapping" : "below threshold fallback",
  };
}

function runUrgencyStage(input) {
  if (input.urgencySignals.patientUrgencyMarker) {
    return {
      stage: "urgency_suggestion",
      urgency: input.urgencySignals.patientUrgencyMarker.urgency,
      urgencySource: "patient urgency marker",
      matchedUrgencyKeywords: input.urgencySignals.keywordSuggestion.matchedUrgencyKeywords ?? [],
      patientUrgencyMarker: input.urgencySignals.patientUrgencyMarker,
      source: "gp marker override",
    };
  }

  return {
    stage: "urgency_suggestion",
    urgency: input.urgencySignals.keywordSuggestion.urgency,
    urgencySource: input.urgencySignals.keywordSuggestion.urgencySource,
    matchedUrgencyKeywords: input.urgencySignals.keywordSuggestion.matchedUrgencyKeywords ?? [],
    patientUrgencyMarker: null,
    source: "keyword similarity or unknown classification",
  };
}

function runNextStepStage(input) {
  return {
    stage: "next_step_suggestion",
    nextStep: input.proxy.nextStep,
    source: "proxy mapping",
  };
}

export function runPrototypeVoicemailModel(input) {
  const summaryStage = runSummaryStage(input);
  const intentStage = runIntentStage(input);
  const urgencyStage = runUrgencyStage(input);
  const nextStepStage = runNextStepStage(input);

  return {
    model: PROTOTYPE_VOICEMAIL_MODEL,
    inputSummary: {
      receivedAt: input.metadata.receivedAt,
      callerPhone: input.metadata.callerPhone,
      previousVoicemailCount: input.previousVoicemails.length,
    },
    stages: {
      summary: summaryStage,
      intents: intentStage,
      urgency: urgencyStage,
      nextStep: nextStepStage,
    },
    output: {
      reason: summaryStage.reason,
      summary: summaryStage.summary,
      transcriptionConfidence: summaryStage.transcriptionConfidence,
      intent: intentStage.primaryIntent.label,
      intents: intentStage.qualifyingIntents,
      intentConfidence: intentStage.primaryIntent.confidence,
      primaryIntentScore: intentStage.primaryIntent.score,
      urgency: urgencyStage.urgency,
      urgencySource: urgencyStage.urgencySource,
      matchedUrgencyKeywords: urgencyStage.matchedUrgencyKeywords,
      patientUrgencyMarker: urgencyStage.patientUrgencyMarker,
      nextStep: nextStepStage.nextStep,
    },
  };
}
