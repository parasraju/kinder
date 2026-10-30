import path from "node:path";
import fs from "node:fs";
import express from "express";
import { env } from "./env";
import { db } from "./db";
import { attachUser, pruneExpiredSessions } from "./auth";
import { errorHandler, requireTrustedOrigin } from "./http";
import { ensureDemoUser } from "./services/demo";
import authRoutes from "./routes/auth";
import overviewRoutes from "./routes/overview";
import catalogRoutes from "./routes/catalog";
import savedApiRoutes from "./routes/savedApis";
import credentialRoutes from "./routes/credentials";
import playgroundRoutes from "./routes/playground";
import historyRoutes from "./routes/history";
import scanRoutes from "./routes/scans";
import integrationRoutes from "./routes/integrations";
import settingsRoutes from "./routes/settings";

const app = express();

app.disable("x-powered-by");
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  next();
});

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "64kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, service: "kinder-apply", time: new Date().toISOString() });
});

app.use("/api", attachUser);
app.use("/api", requireTrustedOrigin);

app.use("/api/auth", authRoutes);
app.use("/api/overview", overviewRoutes);
app.use("/api/catalog", catalogRoutes);
app.use("/api/saved-apis", savedApiRoutes);
app.use("/api/credentials", credentialRoutes);
app.use("/api/playground", playgroundRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/scans", scanRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/api/settings", settingsRoutes);

app.use("/api", (_req, res) => {
  res.status(404).json({ error: { code: "not_found", message: "That API route does not exist." } });
});

if (env.isProduction) {
  const distDir = path.join(process.cwd(), "dist");
  if (!fs.existsSync(path.join(distDir, "index.html"))) {
    console.warn("[kinder] dist/index.html not found. Run `npm run build` before `npm start`.");
  }
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders: (res, filePath) => {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
      },
    }),
  );
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    if (req.path.startsWith("/api")) return next();
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
    res.sendFile(path.join(distDir, "index.html"));
  });
} else {
  app.get("/", (_req, res) => {
    res.type("text/plain").send(
      "Kinder API is running. Start the frontend with `npm run dev:web` or open http://localhost:5173",
    );
  });
}

app.use(errorHandler);

pruneExpiredSessions();
setInterval(pruneExpiredSessions, 6 * 60 * 60 * 1000).unref();

if (env.seedDemo) {
  try {
    ensureDemoUser();
    console.log("[kinder] demo workspace ready: demo@kinderapply.dev / kinderdemo123");
  } catch (error) {
    console.error("[kinder] could not seed the demo workspace", error);
  }
}

const server = app.listen(env.port, "127.0.0.1", () => {
  console.log(`[kinder] API listening on http://127.0.0.1:${env.port} (${env.nodeEnv})`);
});

function shutdown(signal: string) {
  console.log(`[kinder] ${signal} received, shutting down`);
  server.close(() => {
    try {
      db.close();
    } catch {
      /* already closed */
    }
    process.exit(0);
  });
  setTimeout(() => process.exit(0), 4000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
