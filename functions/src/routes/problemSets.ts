import { Router } from "express";

export const problemSetsRouter = Router();

problemSetsRouter.post("/problem-sets", (req, res) => {
  const body = req.body as {
    module?: string;
    difficultyLevel?: number;
    title?: string;
  };

  if (!body.module || !body.title) {
    res.status(400).json({ error: "module and title are required" });
    return;
  }

  res.status(201).json({
    ok: true,
    setId: `set_${Date.now()}`,
    module: body.module,
    difficultyLevel: body.difficultyLevel ?? 2,
  });
});

problemSetsRouter.put("/problem-sets/:setId", (req, res) => {
  const body = req.body as {
    title?: string;
    status?: string;
  };

  res.status(200).json({
    ok: true,
    setId: req.params.setId,
    title: body.title ?? null,
    status: body.status ?? null,
  });
});
