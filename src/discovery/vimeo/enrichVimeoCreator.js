const { getVimeoCreatorDetails, getVimeoCreatorVideos } = require("./vimeoClient");
const { classifyVimeoSource } = require("./classifyVimeoSource");

async function enrichVimeoCreator(creatorId) {
  if (!creatorId) {
    return {
      creator: null,
      videos: [],
      averageScore: 0,
      strongCount: 0
    };
  }

  const creator = await getVimeoCreatorDetails(creatorId);
  const videos = await getVimeoCreatorVideos(creatorId);

  let totalScore = 0;
  let strongCount = 0;

  for (const video of videos) {
    const result = classifyVimeoSource(video);
    totalScore += result.score;

    // Vimeo uses a stricter threshold for "strong" content
    if (result.score >= 70) {
      strongCount += 1;
    }
  }

  const averageScore = videos.length
    ? Math.round(totalScore / videos.length)
    : 0;

  return {
    creator,
    videos,
    averageScore,
    strongCount
  };
}

module.exports = {
  enrichVimeoCreator
};
