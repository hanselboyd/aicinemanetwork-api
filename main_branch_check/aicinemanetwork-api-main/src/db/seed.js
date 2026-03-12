require("dotenv").config();
const pool = require("./pool");

async function run() {
  try {
    console.log("Seeding creators...");

    const creators = [
  {
    name: "Front Door Network",
    slug: "front-door-network",
    creator_type: "collective",
    bio: "The AI Cinema Network — curated AI films and creators.",
    location: "California",
    website_url: "https://frontdoormedia.org",
    tags: ["ai cinema", "network"],
    verified: true,
    featured: true,
    published: true,
  },
  {
    name: "AI Indie Director",
    slug: "ai-indie-director",
    creator_type: "individual",
    bio: "Independent filmmaker creating cinematic AI narratives.",
    location: "Los Angeles",
    website_url: null,
    tags: ["ai film", "indie"],
    verified: false,
    featured: false,
    published: true,
  }
];

    for (const c of creators) {
      await pool.query(
        `
        INSERT INTO creators
        (name, slug, creator_type, bio, location, website_url, tags, verified, featured, published)
        VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (slug) DO NOTHING;
        `,
        [
          c.name,
          c.slug,
          c.creator_type,
          c.bio,
          c.location,
          c.website_url,
          c.tags,
          c.verified,
          c.featured,
          c.published,
        ]
      );
    }

    console.log("Seed complete.");
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
