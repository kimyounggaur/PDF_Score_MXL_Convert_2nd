import { cleanupExpiredJobs } from "../src/cleanup.js";

const result = await cleanupExpiredJobs();
console.log(JSON.stringify({ event: "cleanup_expired_jobs", ...result }));

