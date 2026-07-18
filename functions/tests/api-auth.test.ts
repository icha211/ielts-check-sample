import request from "supertest";
import { describe, expect, it } from "vitest";

import { createApiApp } from "../src/app";
import type { VerifyTokenFn } from "../src/types/auth";

function makeApp(roleForToken: "user" | "developer" = "user") {
  const verifier: VerifyTokenFn = async (token: string) => {
    if (token === "invalid-token") {
      throw new Error("invalid");
    }

    return {
      uid: token,
      role: roleForToken,
    };
  };

  return createApiApp(verifier);
}

describe("functions api auth and claims", () => {
  it("serves health route without auth", async () => {
    const app = makeApp();
    const response = await request(app).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it("rejects chat route without bearer token", async () => {
    const app = makeApp();
    const response = await request(app).post("/api/chat").send({
      uid: "user-1",
      module: "listening",
      message: "hello",
    });
    expect(response.status).toBe(401);
  });

  it("rejects uid mismatch on user-scoped route", async () => {
    const app = makeApp();
    const response = await request(app)
      .post("/api/evaluation")
      .set("Authorization", "Bearer user-1")
      .send({
        uid: "user-2",
        module: "reading",
      });
    expect(response.status).toBe(403);
  });

  it("accepts uid match on user-scoped route", async () => {
    const app = makeApp();
    const response = await request(app)
      .post("/api/chat")
      .set("Authorization", "Bearer user-1")
      .send({
        uid: "user-1",
        module: "reading",
        message: "Explain this answer",
      });
    expect(response.status).toBe(200);
    expect(response.body.ok).toBe(true);
  });

  it("rejects non-developer on problem-set admin route", async () => {
    const app = makeApp("user");
    const response = await request(app)
      .post("/api/problem-sets")
      .set("Authorization", "Bearer user-1")
      .send({
        module: "reading",
        title: "Set A",
      });
    expect(response.status).toBe(403);
  });

  it("accepts developer on problem-set admin route", async () => {
    const app = makeApp("developer");
    const response = await request(app)
      .post("/api/problem-sets")
      .set("Authorization", "Bearer dev-1")
      .send({
        module: "reading",
        title: "Set A",
      });
    expect(response.status).toBe(201);
    expect(response.body.ok).toBe(true);
  });
});
