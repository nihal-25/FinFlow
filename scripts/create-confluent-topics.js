// One-time script to create Confluent Cloud Kafka topics
// Run: node scripts/create-confluent-topics.js
"use strict";

const { Kafka } = require("kafkajs");

const BROKER = "pkc-921jm.us-east-2.aws.confluent.cloud:9092";
const USERNAME = process.env.KAFKA_SASL_USERNAME;
const PASSWORD = process.env.KAFKA_SASL_PASSWORD;

if (!USERNAME || !PASSWORD) {
  console.error("Set KAFKA_SASL_USERNAME and KAFKA_SASL_PASSWORD env vars before running.");
  process.exit(1);
}

const kafka = new Kafka({
  clientId: "finflow-topic-admin",
  brokers: [BROKER],
  ssl: true,
  sasl: { mechanism: "plain", username: USERNAME, password: PASSWORD },
});

const TOPICS = [
  "transactions.created",
  "transactions.completed",
  "transactions.failed",
  "fraud.alerts",
  "notifications.email",
  "notifications.webhook",
];

async function main() {
  const admin = kafka.admin();
  await admin.connect();
  console.log("[admin] Connected to Confluent Cloud");

  const existing = await admin.listTopics();
  console.log("[admin] Existing topics:", existing.length ? existing.join(", ") : "(none)");

  const toCreate = TOPICS.filter((t) => !existing.includes(t));
  if (toCreate.length === 0) {
    console.log("[admin] All topics already exist. Nothing to do.");
    await admin.disconnect();
    return;
  }

  await admin.createTopics({
    waitForLeaders: true,
    topics: toCreate.map((topic) => ({
      topic,
      numPartitions: 3,
      replicationFactor: 3,
      configEntries: [
        { name: "retention.ms", value: String(7 * 24 * 60 * 60 * 1000) }, // 7 days
        { name: "compression.type", value: "gzip" },
      ],
    })),
  });

  console.log("[admin] Created topics:", toCreate.join(", "));
  await admin.disconnect();
  console.log("[admin] Done.");
}

main().catch((err) => {
  console.error("[admin] Fatal error:", err);
  process.exit(1);
});
