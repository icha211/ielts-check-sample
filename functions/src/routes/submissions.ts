import { Router } from "express";

export const submissionsRouter = Router();

submissionsRouter.post("/submissions/start", (req, res) => {
  const body = req.body as {
    uid?: string;
    setId?: string;
    module?: string;
    mode?: string;
  };

  if (!body.uid || !body.setId || !body.module || !body.mode) {
    res.status(400).json({ error: "uid, setId, module, and mode are required" });
    return;
  }

  res.status(200).json({
    ok: true,
    submissionId: `sub_${Date.now()}`,
    status: "in_progress",
    uid: body.uid,
  });
});

submissionsRouter.post("/submissions/:submissionId/submit", (req, res) => {
  const body = req.body as {
    uid?: string;
    answers?: Array<unknown>;
  };

  if (!body.uid || !Array.isArray(body.answers)) {
    res.status(400).json({ error: "uid and answers[] are required" });
    return;
  }

  res.status(200).json({
    ok: true,
    submissionId: req.params.submissionId,
    status: "submitted",
    answerCount: body.answers.length,
  });
});
