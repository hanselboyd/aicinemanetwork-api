const { getVimeoCreatorDetails } = require("./vimeoClient");
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

async function enrichVimeoContacts(item) {
  const descriptionContacts = extractContacts(item?.description || "");
  const creator = item?.creatorId
    ? await getVimeoCreatorDetails(item.creatorId)
    : null;

  const creatorContacts = extractContacts(creator?.bio || "");

  const vimeoProfileContacts = [];
  if (creator?.link || item?.creatorId) {
    const value = creator?.link || `https://vimeo.com/user${item.creatorId}`;
    vimeoProfileContacts.push({
      type: "vimeo",
      value
    });
  }

  // Add creator website if available
  const creatorWebsiteContacts = [];
  if (creator?.websiteUrl) {
    creatorWebsiteContacts.push({
      type: "website",
      value: creator.websiteUrl
    });
  }

  const allContacts = dedupeContacts([
    ...descriptionContacts,
    ...creatorContacts,
    ...vimeoProfileContacts,
    ...creatorWebsiteContacts
  ]);

  return {
    creator,
    contacts: allContacts
  };
}

module.exports = {
  enrichVimeoContacts
};
