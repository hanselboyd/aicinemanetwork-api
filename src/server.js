require("dotenv").config();
const { MongoClient } = require("mongodb");
const app = require("./app");

const port = process.env.PORT || 8080;
const mongoUri = process.env.MONGO_URI;
const dbName = process.env.DB_NAME;

if (!mongoUri) {
  throw new Error("Missing MONGO_URI or DATABASE_URL in environment");
}

if (!dbName) {
  throw new Error("Missing DB_NAME in environment");
}

async function start() {
  const client = new MongoClient(mongoUri);
  await client.connect();

  const db = client.db(dbName);
  app.locals.db = db;
  app.locals.mongoClient = client;

  app.listen(port, () => {
    console.log(`API listening on port ${port}`);
  });
}

start().catch((err) => {
  console.error("Failed to start API", err);
  process.exit(1);
});
