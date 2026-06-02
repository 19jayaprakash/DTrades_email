import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import path from "node:path";
import { fileURLToPath } from "node:url";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));

app.use("/api", router);

// Serve frontend static assets in production mode
if (process.env.NODE_ENV === "production") {
  const currentDir = typeof __dirname !== "undefined"
    ? __dirname
    : path.dirname(fileURLToPath(import.meta.url));
    
  // In built bundle artifacts/api-server/dist/index.mjs, public is located at:
  // __dirname (dist) -> ../../email-crm/dist/public
  const publicDir = path.resolve(currentDir, "../../email-crm/dist/public");
  
  app.use(express.static(publicDir));
  
  // Wildcard fallback to support React SPA router paths
  app.get("*", (req, res) => {
    res.sendFile(path.resolve(publicDir, "index.html"));
  });
}

export default app;
