import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import { Server as SocketIOServer } from "socket.io";
import { env } from "./config/env.js";
import { pool, redis } from "./config/db.js";
import apiRouter from "./routes/api.js";
import { setupSockets } from "./sockets/socketHandler.js";

export const app = express();
const server = http.createServer(app);

export const io = new SocketIOServer(server, {
  cors: {
    origin: env.FRONTEND_URL,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  },
});

setupSockets(io);

app.use(helmet());
app.use(cors({ origin: env.FRONTEND_URL, credentials: true }));
app.use(express.json());

// Health Check Endpoint (Requirement 7)
app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    const redisPing = await redis.ping();
    res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      services: {
        database: "healthy",
        redis: redisPing === "PONG" ? "healthy" : "degraded",
      },
    });
  } catch (error) {
    res.status(503).json({
      status: "error",
      message: "Service unhealthy",
      details: env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
});

// API Routes
app.use("/api", apiRouter);

// Global Error Handler (Requirement 6)
app.use((err, _req, res, _next) => {
  console.error(
    JSON.stringify({
      level: "error",
      message: err.message,
      timestamp: new Date().toISOString(),
    }),
  );

  res.status(err.status || 500).json({
    error: err.message || "Internal Server Error",
    ...(env.NODE_ENV === "development" && { stack: err.stack }),
  });
});

if (env.NODE_ENV !== "test") {
  server.listen(env.PORT, () => {
    console.log(
      JSON.stringify({
        level: "info",
        message: `Backend server running on http://localhost:${env.PORT}`,
        timestamp: new Date().toISOString(),
      }),
    );
  });
}

// Graceful Shutdown (Requirement 7)
const shutdown = async (signal) => {
  console.log(`Received ${signal}. Shutting down gracefully...`);
  server.close(async () => {
    await pool.end();
    await redis.quit();
    console.log("Closed MySQL pool and Redis connections. Exiting.");
    process.exit(0);
  });
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
