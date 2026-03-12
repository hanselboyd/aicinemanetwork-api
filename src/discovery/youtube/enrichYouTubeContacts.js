const { getYouTubeChannelDetails } = require("./youtubeClient");
const { extractContacts } = require("../shared/extractContacts");

function dedupeContacts(contacts) {
  const seen = new Set();
  const results = [];

  for (const contact of contacts) {
    const key = `${contact.type}::${contact.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push(contact);
    }
  }

  return results;
}

async function enrichYouTubeContacts(item) {
  const descriptionContacts = extractContacts(item?.description || "");
  const channel = item?.channelId
    ? await getYouTubeChannelDetails(item.channelId)
    : null;

  const channelContacts = extractContacts(channel?.description || "");

  const customUrlContacts = [];
  if (channel?.customUrl) {
    const value = String(channel.customUrl).startsWith("@")
      ? `https://www.youtube.com/${channel.customUrl}`
      : `https://www.youtube.com/${channel.customUrl}`;

    customUrlContacts.push({
      type: "youtube",
      value
    });
  }

  const allContacts = dedupeContacts([
    ...descriptionContacts,
    ...channelContacts,
    ...customUrlContacts
  ]);

  return {
    channel,
    contacts: allContacts
  };
}

module.exports = {
  enrichYouTubeContacts
};
