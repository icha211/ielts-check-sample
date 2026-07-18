import express from "express";

import { requireAuth, requireDeveloper, requireUidMatchInBody, requireUidMatchInParams } from "./middleware/auth";
import { chatRouter } from "./routes/chat";
import { evaluationRouter } from "./routes/evaluation";
import { healthRouter } from "./routes/health";
import { problemSetsRouter } from "./routes/problemSets";
import { studyPlansRouter } from "./routes/studyPlans";
import { submissionsRouter } from "./routes/submissions";
import type { VerifyTokenFn } from "./types/auth";

export function createApiApp(verifyToken: VerifyTokenFn): express.Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));

  const authOnly = requireAuth(verifyToken);

  app.use("/api", healthRouter);

  app.use("/api/chat", authOnly);
  app.use("/api/chat", requireUidMatchInBody("uid"));
  app.use("/api", chatRouter);

  app.use("/api/evaluation", authOnly);
  app.use("/api/evaluation", requireUidMatchInBody("uid"));
  app.use("/api", evaluationRouter);

  app.use("/api/submissions/start", authOnly, requireUidMatchInBody("uid"));
  app.use("/api/submissions/:submissionId/submit", authOnly, requireUidMatchInBody("uid"));
  app.use("/api", submissionsRouter);

  app.use("/api/study-plans/:uid", authOnly, requireUidMatchInParams("uid"));
  app.use("/api/study-plans/upsert", authOnly, requireUidMatchInBody("uid"));
  app.use("/api", studyPlansRouter);

  app.use("/api/problem-sets", authOnly, requireDeveloper);
  app.use("/api/problem-sets/:setId", authOnly, requireDeveloper);
  app.use("/api", problemSetsRouter);

  app.use((_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  return app;
}
