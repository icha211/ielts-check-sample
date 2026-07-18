"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluationRouter = void 0;
const express_1 = require("express");
exports.evaluationRouter = (0, express_1.Router)();
exports.evaluationRouter.post("/evaluation", (req, res) => {
    const body = req.body;
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
