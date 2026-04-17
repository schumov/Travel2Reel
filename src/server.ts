import express, { NextFunction, Request, Response } from "express";
import path from "path";
import swaggerUi from "swagger-ui-express";
import { env } from "./config/env";
import { sessionMiddleware } from "./auth/session";
import { passport } from "./auth/passport";
import { mapRouter } from "./routes/mapRoutes";
import { getMapRouter } from "./routes/getMapRoute";
import { authRouter } from "./routes/authRoutes";
import { userRouter } from "./routes/userRoutes";
import { adminRouter } from "./routes/adminRoutes";
import { closeMapRenderer } from "./services/mapRenderService";
import { closeRedis, initRedis } from "./cache/redisClient";
import { attachGuestUser } from "./middleware/attachGuestUser";
import { HttpError } from "./utils/validators";
import { openApiDocument } from "./swagger/openapi";

const app = express();
const port = env.PORT;
const publicDir = path.join(process.cwd(), "public");

app.set("trust proxy", 1);
app.use(express.static(publicDir));
app.use(express.json());
app.use(sessionMiddleware);
app.use(passport.initialize());
app.use(passport.session());
app.use(attachGuestUser);

app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});

app.get("/", (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.get("/admin", (_req: Request, res: Response) => {
  res.sendFile(path.join(publicDir, "admin.html"));
});

app.get("/api/openapi.json", (_req: Request, res: Response) => {
  res.status(200).json(openApiDocument);
});

app.use("/api/docs", swaggerUi.serve, swaggerUi.setup(openApiDocument));
app.use("/auth", authRouter);
app.use("/admin", adminRouter);

app.use("/api/map", mapRouter);
app.use("/api", getMapRouter);
app.use("/api/user", userRouter);

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

const server = app.listen(port, () => {
  console.log(`Map API listening on port ${port}`);
});

void initRedis();

async function shutdown(): Promise<void> {
  server.close(async () => {
    await closeRedis();
    await closeMapRenderer();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
