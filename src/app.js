require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

// Routes
const creatorsRouter = require("./routes/creators");
const claimsRouter = require("./routes/claims");
const crawlerRouter = require("./routes/crawler");
const statsRouter = require("./routes/stats");

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN?.split(",") || "*" }));
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (req, res) => {
  res.json({ ok: true, service: "AI Cinema Network API" });
});

// API routes
app.use("/api/creators", creatorsRouter);
app.use("/api/claim", claimsRouter);
app.use("/api/crawler", crawlerRouter);
app.use("/api/stats", statsRouter);

module.exports = app;
