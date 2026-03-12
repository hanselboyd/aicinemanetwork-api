function shouldAcceptVimeoSource({ classification, creatorEnrichment }) {
  const score = Number(classification?.score || 0);
  const label = classification?.label || "false_positive";

  const averageScore = Number(creatorEnrichment?.averageScore || 0);
  const strongCount = Number(creatorEnrichment?.strongCount || 0);
  const videoCount = Number(creatorEnrichment?.videos?.length || 0);

  // Reject below threshold - Vimeo is stricter
  if (score < 50) {
    return {
      accept: false,
      reason: "score_below_threshold"
    };
  }

  // Very strong individual score
  if (score >= 85) {
    return {
      accept: true,
      reason: "very_strong_score"
    };
  }

  // Strong filmmaker with repeated strong creator pattern
  if (label === "ai_filmmaker" && score >= 70 && strongCount >= 2) {
    return {
      accept: true,
      reason: "strong_score_and_creator"
    };
  }

  // Strong score with good creator average
  if (label === "ai_filmmaker" && score >= 75 && averageScore >= 55) {
    return {
      accept: true,
      reason: "strong_score_and_average"
    };
  }

  // Mixed but very consistent creator
  if (label === "mixed" && strongCount >= 3 && averageScore >= 55) {
    return {
      accept: true,
      reason: "mixed_but_consistent_creator"
    };
  }

  // Reject mixed without strong creator evidence
  if (label === "mixed") {
    return {
      accept: false,
      reason: "mixed_not_strong_enough"
    };
  }

  // Reject possible_ai_film on Vimeo
  if (label === "possible_ai_film") {
    return {
      accept: false,
      reason: "possible_ai_film_not_allowed"
    };
  }

  return {
    accept: false,
    reason: "default_reject"
  };
}

module.exports = {
  shouldAcceptVimeoSource
};
