const express = require("express");
const { enrichCreatorGeography } = require("../lib/enrichCreatorGeography");

const router = express.Router();

router.post("/api/admin/enrich-creators-geo", async (req, res) => {
  try {
    const limit = Number(req.body?.limit || 1000);
    const onlyMissing = req.body?.onlyMissing !== false;

    const db = req.app.locals.db;
    if (!db) {
      return res.status(500).json({ ok: false, error: "Database not initialized" });
    }

    const query = onlyMissing
      ? {
          $and: [
            {
              $or: [
                { countryCode: { $exists: false } },
                { countryCode: null },
                { countryCode: "" },
              ],
            },
            {
              $or: [
                { "location.countryCode": { $exists: false } },
                { "location.countryCode": null },
                { "location.countryCode": "" },
              ],
            },
          ],
        }
      : {};

    const creators = await db.collection("creators").find(query).limit(limit).toArray();

    let updated = 0;
    let enriched = 0;
    let review = 0;

    for (const creator of creators) {
      const next = enrichCreatorGeography(creator);

      const changed =
        (next.countryCode || null) !== (creator.countryCode || null) ||
        (next.country || null) !== (creator.country || null) ||
        JSON.stringify(next.location || {}) !== JSON.stringify(creator.location || {}) ||
        !!next.geographyEnriched !== !!creator.geographyEnriched ||
        !!next.geographyNeedsReview !== !!creator.geographyNeedsReview;

      if (!changed) continue;

      await db.collection("creators").updateOne(
        { _id: creator._id },
        {
          $set: {
            countryCode: next.countryCode ?? null,
            country: next.country ?? null,
            enrichedCountryCode: next.enrichedCountryCode ?? null,
            enrichedCountry: next.enrichedCountry ?? null,
            location: next.location ?? {},
            geographyEnriched: !!next.geographyEnriched,
            geographyNeedsReview: !!next.geographyNeedsReview,
            geographyEnrichedAt: new Date(),
          },
        }
      );

      updated += 1;
      if (next.geographyEnriched) enriched += 1;
      if (next.geographyNeedsReview) review += 1;
    }

    return res.json({
      ok: true,
      scanned: creators.length,
      updated,
      enriched,
      review,
    });
  } catch (error) {
    console.error("enrich-creators-geo failed", error);
    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to enrich creators",
    });
  }
});
router.get("/api/admin/enrich-creators-geo/unmatched", async (req, res) => {
  try {
    const limit = Number(req.query.limit || 50);
    const db = req.app.locals.db;

    if (!db) {
      return res.status(500).json({ ok: false, error: "Database not initialized" });
    }

    const docs = await db
      .collection("creators")
      .find({
        $or: [
          { countryCode: { $exists: false } },
          { countryCode: null },
          { countryCode: "" },
        ],
      })
      .limit(limit)
      .toArray();

    const sample = docs.map((creator) => ({
      id: creator._id,
      name: creator.name || null,
      slug: creator.slug || null,
      bio: creator.bio || null,
      description: creator.description || null,
      locationCity: creator.locationCity || null,
      country: creator.country || null,
      location: creator.location || null,
      headline: creator.headline || null,
      summary: creator.summary || null,
    }));

    return res.json({
      ok: true,
      count: sample.length,
      sample,
    });
  } catch (error) {
    return res.status(500).json({
      ok: false,
      error: error.message || "Failed to fetch unmatched creators",
    });
  }
});
module.exports = router;
