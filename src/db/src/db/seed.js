require("dotenv").config();
const pool = require("./pool");

async function run() {
  const sample = [
    {
      name: "Front Door Network",
      slug: "front-door-network",
      creator_type: "network",
      bio: "The AI Cinema Network — curated AI films and creators.",
      location: "California",
      website_url: "https://frontdoormedia.org",
      tags: ["ai cinema", "network"],
      verified: true,
      featured: true,
      published: true,
    },
    {
      name: "Tippett Studio (AI / Experimental)",
      slug: "tippett-ai-experimental",
      creator_type: "studio",
      bio: "Experimental animation and emerging AI cinema collaborations.",
      location: "USA",
      website_url: "https://tippett.org",
      tags: ["animation", "experimental"],
      verified: false,
      featured: false,
      published: true,
    }
  ];

  for (const c of sample) {
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
  await pool.end();
}

run().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
