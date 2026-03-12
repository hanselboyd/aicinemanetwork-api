const pool = require("../db/pool");

function isBadContact(contactType, contactValue) {
  const value = String(contactValue || "").toLowerCase();

  if (contactType === "email") {
    if (value.startsWith("?subject=")) return true;
    if (!value.includes("@")) return true;
    if (value.includes("enable-javascript.com")) return true;
    return false;
  }

  if (contactType === "x") {
    if (value.includes("twitter.com/intent/")) return true;
    return false;
  }

  if (contactType === "youtube") {
    if (value.includes("runwayml")) return true;
    return false;
  }

  if (contactType === "instagram") {
    if (value.includes("runwayapp")) return true;
    return false;
  }

  if (contactType !== "website") {
    return false;
  }

  const badPatterns = [
    "mailto:",
    "runwayml.com",
    "substack.com",
    "substackcdn.com",
    "enable-javascript.com",
    "discord.gg",
    "/privacy",
    "/terms",
    "/pricing",
    "/api",
    "/docs",
    "/doc",
    "/changelog",
    "/status",
    "/academy",
    "/enterprise",
    "/news",
    "/customers",
    "/research",
    "/product",
    "/brand",
    "/educators",
    "/security",
    "/help",
    "/support",
    "/coc",
    "/careers",
    "/explore",
    "/characters",
    "/feed",
    "/tos",
    "/ccpa",
    ".css",
    ".js",
    ".woff",
    ".woff2",
    ".otf",
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".svg",
    "cloudfront.net"
  ];

  return badPatterns.some((p) => value.includes(p));
}

async function cleanupEnrichedContacts() {
  const res = await pool.query(
    `
    select id, creator_id, contact_type, contact_value
    from creator_contacts
    where source_platform = 'website_enrichment'
    `
  );

  let reviewed = 0;
  let deleted = 0;

  for (const row of res.rows) {
    reviewed += 1;

    if (isBadContact(row.contact_type, row.contact_value)) {
      await pool.query(
        `
        delete from creator_contacts
        where id = $1
        `,
        [row.id]
      );
      deleted += 1;
    }
  }

  return {
    reviewed,
    deleted
  };
}

cleanupEnrichedContacts()
  .then((result) => {
    console.log("Enriched contact cleanup complete:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Enriched contact cleanup failed:", error);
    process.exit(1);
  });
