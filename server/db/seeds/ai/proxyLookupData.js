import { intents, urgencyKeywords } from "../clinicModel/configData.js";
import { structuredVoicemails } from "../voicemail/structuredData.js";

const seededVoicemailIntentClassifications = [
  { voicemailId: "VM-1046", intentId: 5, classificationScore: 0.58 },
  { voicemailId: "VM-1046", intentId: 1, classificationScore: 0.54 },
  { voicemailId: "VM-1046", intentId: 7, classificationScore: 0.49 },
  { voicemailId: "VM-1045", intentId: 7, classificationScore: 0.29 },
  { voicemailId: "VM-1045", intentId: 8, classificationScore: 0.21 },
  { voicemailId: "VM-1045", intentId: 3, classificationScore: 0.17 },
  { voicemailId: "VM-1044", intentId: 3, classificationScore: 0.32 },
  { voicemailId: "VM-1044", intentId: 2, classificationScore: 0.24 },
  { voicemailId: "VM-1044", intentId: 7, classificationScore: 0.18 },
  { voicemailId: "VM-1042", intentId: 1, classificationScore: 0.97 },
  { voicemailId: "VM-1042", intentId: 3, classificationScore: 0.66 },
  { voicemailId: "VM-1042", intentId: 7, classificationScore: 0.48 },
  { voicemailId: "VM-1043", intentId: 1, classificationScore: 0.98 },
  { voicemailId: "VM-1043", intentId: 3, classificationScore: 0.71 },
  { voicemailId: "VM-1043", intentId: 7, classificationScore: 0.4 },
  { voicemailId: "VM-1041", intentId: 2, classificationScore: 0.95 },
  { voicemailId: "VM-1041", intentId: 1, classificationScore: 0.67 },
  { voicemailId: "VM-1041", intentId: 7, classificationScore: 0.32 },
  { voicemailId: "VM-1040", intentId: 2, classificationScore: 0.96 },
  { voicemailId: "VM-1040", intentId: 1, classificationScore: 0.71 },
  { voicemailId: "VM-1040", intentId: 3, classificationScore: 0.41 },
  { voicemailId: "VM-1038", intentId: 4, classificationScore: 0.93 },
  { voicemailId: "VM-1038", intentId: 1, classificationScore: 0.78 },
  { voicemailId: "VM-1038", intentId: 7, classificationScore: 0.34 },
  { voicemailId: "VM-1036", intentId: 4, classificationScore: 0.88 },
  { voicemailId: "VM-1036", intentId: 1, classificationScore: 0.82 },
  { voicemailId: "VM-1036", intentId: 7, classificationScore: 0.28 },
  { voicemailId: "VM-1037", intentId: 5, classificationScore: 0.96 },
  { voicemailId: "VM-1037", intentId: 8, classificationScore: 0.62 },
  { voicemailId: "VM-1037", intentId: 7, classificationScore: 0.29 },
  { voicemailId: "VM-1035", intentId: 3, classificationScore: 0.91 },
  { voicemailId: "VM-1035", intentId: 2, classificationScore: 0.74 },
  { voicemailId: "VM-1035", intentId: 1, classificationScore: 0.58 },
  { voicemailId: "VM-1032", intentId: 8, classificationScore: 0.94 },
  { voicemailId: "VM-1032", intentId: 7, classificationScore: 0.65 },
  { voicemailId: "VM-1030", intentId: 7, classificationScore: 0.62 },
  { voicemailId: "VM-1030", intentId: 8, classificationScore: 0.43 },
  { voicemailId: "VM-1026", intentId: 1, classificationScore: 0.98 },
  { voicemailId: "VM-1026", intentId: 7, classificationScore: 0.57 },
  { voicemailId: "VM-1025", intentId: 4, classificationScore: 0.93 },
  { voicemailId: "VM-1025", intentId: 1, classificationScore: 0.76 },
  { voicemailId: "VM-1024", intentId: 5, classificationScore: 0.96 },
  { voicemailId: "VM-1024", intentId: 7, classificationScore: 0.63 },
  { voicemailId: "VM-1023", intentId: 8, classificationScore: 0.95 },
  { voicemailId: "VM-1023", intentId: 7, classificationScore: 0.61 },
  { voicemailId: "VM-1028", intentId: 6, classificationScore: 0.95 },
  { voicemailId: "VM-1028", intentId: 7, classificationScore: 0.61 },
  { voicemailId: "VM-1027", intentId: 6, classificationScore: 0.89 },
  { voicemailId: "VM-1027", intentId: 3, classificationScore: 0.64 },
  { voicemailId: "VM-1027", intentId: 7, classificationScore: 0.37 },
];

const lowConfidenceScoreByIntentId = {
  1: 0.11,
  2: 0.09,
  3: 0.1,
  4: 0.08,
  5: 0.07,
  6: 0.08,
  7: 0.12,
  8: 0.06,
  9: 0.05,
};

function fallbackClassificationScore(voicemailId, intentId) {
  const checksum = Array.from(voicemailId).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const variation = ((checksum + intentId * 17) % 4) * 0.01;
  const baseScore = lowConfidenceScoreByIntentId[intentId] ?? 0.05;
  return Number(Math.max(0.01, baseScore - variation).toFixed(2));
}

const seededClassificationLookup = seededVoicemailIntentClassifications.reduce((lookup, row) => {
  lookup.set(`${row.voicemailId}:${row.intentId}`, row.classificationScore);
  return lookup;
}, new Map());
const intentLabelById = new Map(intents.map((intent) => [intent.id, intent.label]));
const urgencyKeywordById = new Map(urgencyKeywords.map((urgencyKeyword) => [urgencyKeyword.id, urgencyKeyword]));

export const voicemailIntentClassifications = structuredVoicemails.flatMap(({ voicemailId, clinicId }) => {
  const applicableIntents = intents.filter((intent) => intent.clinicId == null || intent.clinicId === clinicId);

  return applicableIntents.map((intent) => ({
    voicemailId,
    intentId: intent.id,
    classificationScore:
      seededClassificationLookup.get(`${voicemailId}:${intent.id}`) ??
      fallbackClassificationScore(voicemailId, intent.id),
    intentLabelSnapshot: intentLabelById.get(intent.id) ?? "Unknown",
  }));
});

const seededVoicemailUrgencyKeywordSimilarities = [
  { voicemailId: "VM-1046", urgencyKeywordId: 7, similarityScore: 0.42 },
  { voicemailId: "VM-1046", urgencyKeywordId: 4, similarityScore: 0.27 },
  { voicemailId: "VM-1046", urgencyKeywordId: 8, similarityScore: 0.11 },
  { voicemailId: "VM-1045", urgencyKeywordId: 7, similarityScore: 0.14 },
  { voicemailId: "VM-1045", urgencyKeywordId: 9, similarityScore: 0.09 },
  { voicemailId: "VM-1045", urgencyKeywordId: 1, similarityScore: 0.07 },
  { voicemailId: "VM-1044", urgencyKeywordId: 1, similarityScore: 0.19 },
  { voicemailId: "VM-1044", urgencyKeywordId: 4, similarityScore: 0.16 },
  { voicemailId: "VM-1044", urgencyKeywordId: 6, similarityScore: 0.12 },
  { voicemailId: "VM-1042", urgencyKeywordId: 1, similarityScore: 0.98 },
  { voicemailId: "VM-1042", urgencyKeywordId: 2, similarityScore: 0.96 },
  { voicemailId: "VM-1042", urgencyKeywordId: 10, similarityScore: 0.93 },
  { voicemailId: "VM-1043", urgencyKeywordId: 1, similarityScore: 0.68 },
  { voicemailId: "VM-1043", urgencyKeywordId: 3, similarityScore: 0.97 },
  { voicemailId: "VM-1043", urgencyKeywordId: 6, similarityScore: 0.95 },
  { voicemailId: "VM-1041", urgencyKeywordId: 4, similarityScore: 0.97 },
  { voicemailId: "VM-1040", urgencyKeywordId: 4, similarityScore: 0.96 },
  { voicemailId: "VM-1040", urgencyKeywordId: 11, similarityScore: 0.95 },
  { voicemailId: "VM-1038", urgencyKeywordId: 5, similarityScore: 0.97 },
  { voicemailId: "VM-1038", urgencyKeywordId: 12, similarityScore: 0.88 },
  { voicemailId: "VM-1036", urgencyKeywordId: 5, similarityScore: 0.94 },
  { voicemailId: "VM-1036", urgencyKeywordId: 12, similarityScore: 0.76 },
  { voicemailId: "VM-1036", urgencyKeywordId: 13, similarityScore: 0.99 },
  { voicemailId: "VM-1037", urgencyKeywordId: 7, similarityScore: 0.98 },
  { voicemailId: "VM-1032", urgencyKeywordId: 9, similarityScore: 0.98 },
  { voicemailId: "VM-1026", urgencyKeywordId: 1, similarityScore: 0.99 },
  { voicemailId: "VM-1026", urgencyKeywordId: 2, similarityScore: 0.97 },
  { voicemailId: "VM-1026", urgencyKeywordId: 10, similarityScore: 0.91 },
  { voicemailId: "VM-1025", urgencyKeywordId: 5, similarityScore: 0.98 },
  { voicemailId: "VM-1025", urgencyKeywordId: 12, similarityScore: 0.89 },
  { voicemailId: "VM-1024", urgencyKeywordId: 7, similarityScore: 0.97 },
  { voicemailId: "VM-1023", urgencyKeywordId: 9, similarityScore: 0.98 },
  { voicemailId: "VM-1028", urgencyKeywordId: 8, similarityScore: 0.97 },
  { voicemailId: "VM-1027", urgencyKeywordId: 8, similarityScore: 0.94 },
];

const lowUrgencySimilarityScoreByUrgency = {
  Critical: 0.12,
  High: 0.1,
  Normal: 0.08,
  Low: 0.06,
};

function defaultUrgencySimilarityScore(voicemailId, urgencyKeywordId, urgency) {
  const checksum = Array.from(voicemailId).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const variation = ((checksum + urgencyKeywordId * 13) % 5) * 0.01;
  const baseScore = lowUrgencySimilarityScoreByUrgency[urgency] ?? 0.05;
  return Number(Math.max(0.01, baseScore - variation).toFixed(2));
}

const seededUrgencySimilarityLookup = seededVoicemailUrgencyKeywordSimilarities.reduce((lookup, row) => {
  lookup.set(`${row.voicemailId}:${row.urgencyKeywordId}`, row.similarityScore);
  return lookup;
}, new Map());

export const voicemailUrgencyKeywordSimilarities = structuredVoicemails.flatMap(({ voicemailId, clinicId }) => {
  const applicableUrgencyKeywords = urgencyKeywords.filter(
    (urgencyKeyword) => urgencyKeyword.clinicId == null || urgencyKeyword.clinicId === clinicId,
  );

  return applicableUrgencyKeywords.map((urgencyKeyword) => {
    const keywordSnapshot = urgencyKeywordById.get(urgencyKeyword.id);

    return {
      voicemailId,
      urgencyKeywordId: urgencyKeyword.id,
      similarityScore:
        seededUrgencySimilarityLookup.get(`${voicemailId}:${urgencyKeyword.id}`) ??
        defaultUrgencySimilarityScore(voicemailId, urgencyKeyword.id, urgencyKeyword.urgency),
      urgencyKeywordSnapshot: keywordSnapshot?.keyword ?? urgencyKeyword.keyword,
      urgencyLevelSnapshot: keywordSnapshot?.urgency ?? urgencyKeyword.urgency,
    };
  });
});
