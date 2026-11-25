/**
 * SARVYA Dedicated Transactional Job Worker Process (sarvya-worker)
 * Powered by MySQL 8.4 SELECT ... FOR UPDATE SKIP LOCKED
 */
const { initializeDatabase } = require("./src/config/database");
const { closeAsyncPool } = require("./src/config/asyncDb");
const jobWorkerEngine = require("./src/services/queue/jobWorkerEngine");
const { logEvent } = require("./src/utils/logger");

console.log("==================================================================");
console.log(`[SARVYA Worker] Starting transactional MySQL 8.4 job worker (PID: ${process.pid})`);
console.log("==================================================================");

// Ensure database schema is ready
initializeDatabase();

// Worker event telemetry logging
jobWorkerEngine.on("job:started", ({ jobId, jobType, attempts }) => {
  logEvent("info", "worker_job_started", { jobId, jobType, attempts });
  console.log(`[Worker] ⚙️  Job #${jobId} (${jobType}) started (Attempt ${attempts})`);
});

jobWorkerEngine.on("job:completed", ({ jobId, jobType, durationMs }) => {
  logEvent("info", "worker_job_completed", { jobId, jobType, durationMs });
  console.log(`[Worker] ✅ Job #${jobId} (${jobType}) completed in ${durationMs}ms`);
});

jobWorkerEngine.on("job:failed", ({ jobId, jobType, nextRetryInSeconds, error }) => {
  logEvent("warn", "worker_job_failed", { jobId, jobType, nextRetryInSeconds, error });
  console.warn(`[Worker] ⚠️  Job #${jobId} (${jobType}) failed: ${error} (Retrying in ${nextRetryInSeconds}s)`);
});

jobWorkerEngine.on("job:dead_letter", ({ jobId, jobType, attempts, error }) => {
  logEvent("error", "worker_job_dead_letter", { jobId, jobType, attempts, error });
  console.error(`[Worker] ❌ Job #${jobId} (${jobType}) moved to DEAD_LETTER after ${attempts} attempts: ${error}`);
});

// Start the worker engine loop
jobWorkerEngine.start();

// Graceful shutdown handling for PM2 and system signals
let isShuttingDown = false;
async function handleShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n[SARVYA Worker] Received ${signal}. Initiating graceful shutdown...`);

  try {
    await jobWorkerEngine.stop();
    await closeAsyncPool();
    console.log("[SARVYA Worker] Shutdown complete. Process exiting cleanly.");
    process.exit(0);
  } catch (err) {
    console.error("[SARVYA Worker] Error during shutdown:", err);
    process.exit(1);
  }
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));

process.on("unhandledRejection", (reason) => {
  console.error("[SARVYA Worker] Unhandled Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("[SARVYA Worker] Uncaught Exception:", error);
});

