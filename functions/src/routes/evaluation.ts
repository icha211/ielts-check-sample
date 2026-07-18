import { Router } from "express";

export const evaluationRouter = Router();

evaluationRouter.post("/evaluation", (req, res) => {
  const body = req.body as {
    uid?: string;
    module?: string;
    submissionId?: string;
  };

  if (!body.module) {
    res.status(400).json({ error: "module is required" });
    return;
  }

  res.status(200).json({
    ok: true,
    route: "eval-service",
    uid: body.uid,
    module: body.module,
    submissionId: body.submissionId || null,
    summary: "Evaluation route is scaffolded. Connect Gemini evaluation pipeline next.",
  });
});
