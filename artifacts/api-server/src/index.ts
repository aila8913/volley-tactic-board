import app from "./app";
import { logger } from "./lib/logger";

// 開發時 API server 用 API_PORT（3000），讓 Vite dev server 可以獨佔 PORT（5173）。
// 正式部署時只有 PORT，API server 同時負責 serve 前端靜態檔案。
const rawPort = process.env["API_PORT"] ?? process.env["PORT"];

if (!rawPort) {
  throw new Error("API_PORT (or PORT) environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
