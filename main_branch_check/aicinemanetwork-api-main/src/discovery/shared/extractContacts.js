function uniqueByTypeAndValue(items) {
  const seen = new Set();
  const results = [];

  for (const item of items) {
    const key = `${item.type}::${item.value}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push(item);
    }
  }

  return results;
}

function extractContacts(text) {
  const contacts = [];
  const body = text || "";

  const emailMatches =
    body.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];

  for (const email of emailMatches) {
    contacts.push({
      type: "email",
      value: email.toLowerCase()
    });
  }

  const urlMatches = body.match(/https?:\/\/[^\s]+/gi) || [];

  for (const url of urlMatches) {
    const cleanUrl = url.replace(/[),.;]+$/, "");
    const lower = cleanUrl.toLowerCase();

    if (lower.includes("instagram.com")) {
      contacts.push({ type: "instagram", value: cleanUrl });
    } else if (lower.includes("tiktok.com")) {
      contacts.push({ type: "tiktok", value: cleanUrl });
    } else if (lower.includes("x.com") || lower.includes("twitter.com")) {
      contacts.push({ type: "x", value: cleanUrl });
    } else if (lower.includes("vimeo.com")) {
      contacts.push({ type: "vimeo", value: cleanUrl });
    } else if (lower.includes("youtube.com") || lower.includes("youtu.be")) {
      contacts.push({ type: "youtube", value: cleanUrl });
    } else {
      contacts.push({ type: "website", value: cleanUrl });
    }
  }

  return uniqueByTypeAndValue(contacts);
}

module.exports = {
  extractContacts
};
