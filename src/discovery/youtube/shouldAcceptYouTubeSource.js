function shouldAcceptYouTubeSource({ classification, channelEnrichment }) {
  const score = Number(classification?.score || 0);
  const label = classification?.label || "false_positive";

  const averageScore = Number(channelEnrichment?.averageScore || 0);
  const strongCount = Number(channelEnrichment?.strongCount || 0);
  const videoCount = Number(channelEnrichment?.videos?.length || 0);

  if (score < 45) {
    return {
      accept: false,
      reason: "score_below_threshold"
    };
  }

  if (score >= 80) {
    return {
      accept: true,
      reason: "very_strong_score"
    };
  }

  if (label === "ai_filmmaker" && score >= 65 && strongCount >= 2) {
    return {
      accept: true,
      reason: "strong_score_and_channel"
    };
  }

  if (label === "ai_filmmaker" && score >= 70 && averageScore >= 50) {
    return {
      accept: true,
      reason: "strong_score_and_average"
    };
  }

  if (label === "mixed" && strongCount >= 3 && averageScore >= 50) {
    return {
      accept: true,
      reason: "mixed_but_consistent_channel"
    };
  }

  if (label === "mixed") {
    return {
      accept: false,
      reason: "mixed_not_strong_enough"
    };
  }

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
  shouldAcceptYouTubeSource
};
