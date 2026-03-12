function shouldAcceptYouTubeSource({ classification, channelEnrichment }) {
  const score = Number(classification?.score || 0);
  const label = classification?.label || "false_positive";

  const averageScore = Number(channelEnrichment?.averageScore || 0);
  const strongCount = Number(channelEnrichment?.strongCount || 0);
  const videoCount = Number(channelEnrichment?.videos?.length || 0);

  if (label === "false_positive" && score < 30) {
    return {
      accept: false,
      reason: "clear_false_positive"
    };
  }

  if (score >= 70) {
    return {
      accept: true,
      reason: "strong_index_candidate"
    };
  }

  if (label === "ai_filmmaker") {
    return {
      accept: true,
      reason: "ai_filmmaker_index_candidate"
    };
  }

  if (
    label === "mixed" &&
    (strongCount >= 1 || averageScore >= 40 || videoCount >= 2)
  ) {
    return {
      accept: true,
      reason: "mixed_but_relevant_for_index"
    };
  }

  if (label === "possible_ai_film" && (strongCount >= 1 || score >= 35)) {
    return {
      accept: true,
      reason: "possible_ai_film_for_index"
    };
  }

  return {
    accept: false,
    reason: "too_weak_for_index"
  };
}

module.exports = {
  shouldAcceptYouTubeSource
};
