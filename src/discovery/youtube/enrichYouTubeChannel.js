const { getYouTubeChannelDetails, getYouTubeChannelVideos } = require("./youtubeClient");
const { classifyYouTubeSource } = require("./classifyYouTubeSource");

async function enrichYouTubeChannel(channelId) {
  if (!channelId) {
    return {
      channel: null,
      videos: [],
      averageScore: 0,
      strongCount: 0
    };
  }

  const channel = await getYouTubeChannelDetails(channelId);
  const videos = await getYouTubeChannelVideos(channelId, { maxResults: 6 });

  let totalScore = 0;
  let strongCount = 0;

  for (const video of videos) {
    const result = classifyYouTubeSource(video);
    totalScore += result.score;

    if (result.score >= 65) {
      strongCount += 1;
    }
  }

  const averageScore = videos.length
    ? Math.round(totalScore / videos.length)
    : 0;

  return {
    channel,
    videos,
    averageScore,
    strongCount
  };
}

module.exports = {
  enrichYouTubeChannel
};
