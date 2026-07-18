"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatRouter = void 0;
const express_1 = require("express");
exports.chatRouter = (0, express_1.Router)();
exports.chatRouter.post("/chat", (req, res) => {
    const body = req.body;
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
