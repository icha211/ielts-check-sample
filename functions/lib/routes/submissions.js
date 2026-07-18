"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.submissionsRouter = void 0;
const express_1 = require("express");
exports.submissionsRouter = (0, express_1.Router)();
exports.submissionsRouter.post("/submissions/start", (req, res) => {
    const body = req.body;
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
exports.submissionsRouter.post("/submissions/:submissionId/submit", (req, res) => {
    const body = req.body;
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
