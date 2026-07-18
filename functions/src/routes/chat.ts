import { Router } from "express";

export const chatRouter = Router();

chatRouter.post("/chat", (req, res) => {
  const body = req.body as { message?: string; module?: string; uid?: string };

  if (!body.message || !body.module) {
    res.status(400).json({ error: "message and module are required" });
    return;
  }

  res.status(200).json({
    ok: true,
    route: "chat-service",
    uid: body.uid,
    module: body.module,
    reply: "Chat route is scaffolded. Connect Gemini conversation orchestration next.",
  });
});
