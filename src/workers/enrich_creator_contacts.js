const pool = require("../db/pool");

function stripHtml(html) {
  return (html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function absoluteUrl(baseUrl, maybeRelativeUrl) {
  try {
    if (String(maybeRelativeUrl || "").startsWith("mailto:")) {
      return maybeRelativeUrl;
    }
    return new URL(maybeRelativeUrl, baseUrl).toString();
  } catch {
    return null;
  }
}

function extractEmails(text) {
  const matches =
    String(text || "").match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || [];

  return [...new Set(matches.map((v) => v.toLowerCase()))];
}

function extractLinks(html, baseUrl) {
  const matches = [
    ...String(html || "").matchAll(/href\s*=\s*["']([^"']+)["']/gi)
  ];

  const urls = matches
    .map((m) => m[1])
    .map((href) => absoluteUrl(baseUrl, href))
    .filter(Boolean);

  return [...new Set(urls)];
}

function classifyUrl(url) {
  const lower = String(url || "").toLowerCase();

  if (lower.startsWith("mailto:")) return "email";
  if (lower.includes("instagram.com")) return "instagram";
  if (lower.includes("tiktok.com")) return "tiktok";
  if (lower.includes("x.com") || lower.includes("twitter.com")) return "x";
  if (lower.includes("vimeo.com")) return "vimeo";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
  return "website";
}

function isUsefulWebsiteUrl(url) {
  const lower = String(url || "").toLowerCase();

  const badPatterns = [
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
    "discord.gg",
    "substackcdn.com",
    "enable-javascript.com"
  ];

  const goodPatterns = [
    "/contact",
    "/about",
    "/bio",
    "/links",
    "/portfolio",
    "/studio",
    "/press",
    "linktr.ee",
    "beacons.ai",
    "solo.to",
    "carrd.co"
  ];

  if (goodPatterns.some((p) => lower.includes(p))) {
    return true;
  }

  if (badPatterns.some((p) => lower.includes(p))) {
    return false;
  }

  return false;
}

function isBlockedEnrichmentDomain(url) {
  const lower = String(url || "").toLowerCase();

  const blockedDomains = [
    "runwayml.com",
    "substack.com",
    "substackcdn.com",
    "enable-javascript.com",
    "twitter.com",
    "x.com",
    "instagram.com",
    "youtube.com",
    "youtu.be",
    "discord.gg"
  ];

  return blockedDomains.some((domain) => {
    try {
      const hostname = new URL(url).hostname.toLowerCase();
      return hostname === domain || hostname.endsWith(`.${domain}`);
    } catch {
      return lower.includes(domain);
    }
  });
}

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

async function fetchWebsite(url) {
  const response = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 AI Cinema Network Contact Enricher"
    }
  });

  const contentType = response.headers.get("content-type") || "";

  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  if (!contentType.toLowerCase().includes("text/html")) {
    return {
      finalUrl: response.url,
      html: "",
      text: ""
    };
  }

  const html = await response.text();

  return {
    finalUrl: response.url,
    html,
    text: stripHtml(html)
  };
}

function extractContactsFromWebsite({ html, text, finalUrl }) {
  const contacts = [];

  for (const email of extractEmails(text)) {
    contacts.push({
      type: "email",
      value: email
    });
  }

  const links = extractLinks(html, finalUrl);

  for (const link of links) {
    const type = classifyUrl(link);

    if (type === "email") {
      const email = String(link).replace(/^mailto:/i, "").trim().toLowerCase();
      if (email && email.includes("@") && !email.startsWith("?subject=")) {
        contacts.push({
          type: "email",
          value: email
        });
      }
      continue;
    }

    if (["instagram", "tiktok", "x", "vimeo", "youtube"].includes(type)) {
      contacts.push({
        type,
        value: link
      });
      continue;
    }

    if (type === "website" && isUsefulWebsiteUrl(link)) {
      contacts.push({
        type: "website",
        value: link
      });
    }
  }

  return dedupeContacts(contacts);
}

async function saveContacts(creatorId, sourceUrl, contacts) {
  let inserted = 0;

  for (const contact of contacts) {
    const exists = await pool.query(
      `
      select 1
      from creator_contacts
      where creator_id = $1
        and contact_type = $2
        and contact_value = $3
      limit 1
      `,
      [creatorId, contact.type, contact.value]
    );

    if (!exists.rows.length) {
      await pool.query(
        `
        insert into creator_contacts (
          creator_id,
          contact_type,
          contact_value,
          source_platform,
          source_url,
          is_primary,
          created_at,
          updated_at
        )
        values ($1, $2, $3, 'website_enrichment', $4, false, now(), now())
        `,
        [creatorId, contact.type, contact.value, sourceUrl]
      );

      inserted += 1;
    } else {
      await pool.query(
        `
        update creator_contacts
        set updated_at = now(),
            source_url = $4
        where creator_id = $1
          and contact_type = $2
          and contact_value = $3
        `,
        [creatorId, contact.type, contact.value, sourceUrl]
      );
    }
  }

  return inserted;
}

async function updateClaimReady(creatorId) {
  const creatorRes = await pool.query(
    `
    select id, discovery_confidence
    from creators
    where id = $1
    limit 1
    `,
    [creatorId]
  );

  const creator = creatorRes.rows[0];
  if (!creator) return false;

  const contactsRes = await pool.query(
    `
    select contact_type
    from creator_contacts
    where creator_id = $1
    `,
    [creatorId]
  );

  const contactTypes = contactsRes.rows.map((r) => r.contact_type);
  const hasEmail = contactTypes.includes("email");
  const hasWebsiteLike = contactTypes.some((type) =>
    ["website", "instagram", "x", "tiktok", "vimeo"].includes(type)
  );

  const shouldMarkClaimReady =
    Number(creator.discovery_confidence || 0) >= 70 &&
    (hasEmail || hasWebsiteLike);

  if (shouldMarkClaimReady) {
    await pool.query(
      `
      update creators
      set auto_claim_ready = true
      where id = $1
      `,
      [creatorId]
    );
  }

  return shouldMarkClaimReady;
}

async function enrichCreatorContacts() {
  const targetsRes = await pool.query(
    `
    select distinct
      c.id as creator_id,
      c.name,
      c.discovery_confidence,
      cc.contact_value as website_url
    from creators c
    join creator_contacts cc on cc.creator_id = c.id
    where c.primary_platform = 'youtube'
      and cc.contact_type = 'website'
    order by c.discovery_confidence desc, c.name asc
    limit 25
    `
  );

  let processed = 0;
  let enriched = 0;
  let totalContactsInserted = 0;
  let claimReadyUpdated = 0;

  for (const row of targetsRes.rows) {
    processed += 1;

    if (isBlockedEnrichmentDomain(row.website_url)) {
      continue;
    }

    try {
      const page = await fetchWebsite(row.website_url);
      const contacts = extractContactsFromWebsite(page);

      if (contacts.length > 0) {
        const inserted = await saveContacts(
          row.creator_id,
          row.website_url,
          contacts
        );

        totalContactsInserted += inserted;
        enriched += 1;
      }

      const claimReady = await updateClaimReady(row.creator_id);
      if (claimReady) {
        claimReadyUpdated += 1;
      }
    } catch (error) {
      console.error(
        `Website enrichment failed for ${row.website_url}:`,
        error.message
      );
    }
  }

  return {
    processed,
    enriched,
    totalContactsInserted,
    claimReadyUpdated
  };
}

enrichCreatorContacts()
  .then((result) => {
    console.log("Creator contact enrichment complete:", result);
    process.exit(0);
  })
  .catch((error) => {
    console.error("Creator contact enrichment failed:", error);
    process.exit(1);
  });
