import { Router } from "express";

export const studyPlansRouter = Router();

studyPlansRouter.get("/study-plans/:uid", (req, res) => {
  res.status(200).json({
    ok: true,
    uid: req.params.uid,
    plans: [],
  });
});

studyPlansRouter.post("/study-plans/upsert", (req, res) => {
  const body = req.body as {
    uid?: string;
    monthKey?: string;
    days?: Array<unknown>;
  };

  if (!body.uid || !body.monthKey || !Array.isArray(body.days)) {
    res.status(400).json({ error: "uid, monthKey, and days[] are required" });
    return;
  }

  res.status(200).json({
    ok: true,
    uid: body.uid,
    monthKey: body.monthKey,
    updatedDays: body.days.length,
  });
});
