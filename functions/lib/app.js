"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApiApp = createApiApp;
const express_1 = __importDefault(require("express"));
const auth_1 = require("./middleware/auth");
const chat_1 = require("./routes/chat");
const evaluation_1 = require("./routes/evaluation");
const health_1 = require("./routes/health");
const problemSets_1 = require("./routes/problemSets");
const studyPlans_1 = require("./routes/studyPlans");
const submissions_1 = require("./routes/submissions");
function createApiApp(verifyToken) {
    const app = (0, express_1.default)();
    app.disable("x-powered-by");
    app.use(express_1.default.json({ limit: "1mb" }));
    const authOnly = (0, auth_1.requireAuth)(verifyToken);
    app.use("/api", health_1.healthRouter);
    app.use("/api/chat", authOnly);
    app.use("/api/chat", (0, auth_1.requireUidMatchInBody)("uid"));
    app.use("/api", chat_1.chatRouter);
    app.use("/api/evaluation", authOnly);
    app.use("/api/evaluation", (0, auth_1.requireUidMatchInBody)("uid"));
    app.use("/api", evaluation_1.evaluationRouter);
    app.use("/api/submissions/start", authOnly, (0, auth_1.requireUidMatchInBody)("uid"));
    app.use("/api/submissions/:submissionId/submit", authOnly, (0, auth_1.requireUidMatchInBody)("uid"));
    app.use("/api", submissions_1.submissionsRouter);
    app.use("/api/study-plans/:uid", authOnly, (0, auth_1.requireUidMatchInParams)("uid"));
    app.use("/api/study-plans/upsert", authOnly, (0, auth_1.requireUidMatchInBody)("uid"));
    app.use("/api", studyPlans_1.studyPlansRouter);
    app.use("/api/problem-sets", authOnly, auth_1.requireDeveloper);
    app.use("/api/problem-sets/:setId", authOnly, auth_1.requireDeveloper);
    app.use("/api", problemSets_1.problemSetsRouter);
    app.use((_req, res) => {
        res.status(404).json({ error: "Not found" });
    });
    return app;
}
