async function searchVimeoVideos(query) {
  console.log(`[vimeoClient] searchVimeoVideos called with query: ${query}`);
  return [];
}

async function getVimeoCreatorDetails(creatorId) {
  console.log(`[vimeoClient] getVimeoCreatorDetails called with creatorId: ${creatorId}`);
  return null;
}

async function getVimeoCreatorVideos(creatorId) {
  console.log(`[vimeoClient] getVimeoCreatorVideos called with creatorId: ${creatorId}`);
  return [];
}

module.exports = {
  searchVimeoVideos,
  getVimeoCreatorDetails,
  getVimeoCreatorVideos
};
