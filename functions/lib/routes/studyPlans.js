"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.studyPlansRouter = void 0;
const express_1 = require("express");
exports.studyPlansRouter = (0, express_1.Router)();
exports.studyPlansRouter.get("/study-plans/:uid", (req, res) => {
    res.status(200).json({
        ok: true,
        uid: req.params.uid,
        plans: [],
    });
});
exports.studyPlansRouter.post("/study-plans/upsert", (req, res) => {
    const body = req.body;
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
