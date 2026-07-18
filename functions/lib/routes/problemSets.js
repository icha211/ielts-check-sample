"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.problemSetsRouter = void 0;
const express_1 = require("express");
exports.problemSetsRouter = (0, express_1.Router)();
exports.problemSetsRouter.post("/problem-sets", (req, res) => {
    const body = req.body;
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
exports.problemSetsRouter.put("/problem-sets/:setId", (req, res) => {
    const body = req.body;
    res.status(200).json({
        ok: true,
        setId: req.params.setId,
        title: body.title ?? null,
        status: body.status ?? null,
    });
});
