const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const firebase = fs.readFileSync(path.join(__dirname, "firebase-mock.js"), "utf8");
const course = {
    title: "Beta listening course", teacherId: "teacher", teacherName: "Beta Teacher",
    category: "listening", type: "self", price: 100000, originalPrice: 0,
    summary: "Practice identifying the evidence in short dialogues.",
    whatYouLearn: "Identify relevant evidence", curriculum: "Listening foundations",
    schedule: "Self-paced access", coverURL: "", previewURL: "", previewPath: "", previewType: "",
    scheduleDays: "Mon, Wed, Fri", startTime: "08:00", endTime: "10:00",
    startDate: "2026-11-05", mode: "online", maxStudents: 5,
    published: true, archived: false, createdAt: 1, updatedAt: 1
};
const practiceResult = {
    sectionKey: "structure", testType: "practicetest", setId: "beta-practice", runMode: "full",
    setDate: "2026-11-03", rawScore: 1, totalQuestions: 2, scaledScore: 50,
    questions: [
        { uid: "1_1", partId: 1, number: 1, questionText: "She ___ every day.", options: { A: "studies", B: "study" }, correctAnswer: "a", userAnswer: "a", isCorrect: true },
        { uid: "1_2", partId: 1, number: 2, questionText: "They ___ ready.", options: { A: "is", B: "are" }, correctAnswer: "b", userAnswer: "a", isCorrect: false }
    ]
};
const aiEndpoint = "https://ielts-api-gateway-753959270698.asia-southeast1.run.app/api/chat";

test.beforeEach(async ({ context, page }) => {
    const errors = [];
    const unexpectedRequests = [];
    page.on("pageerror", error => {
        // Chromium can reject an aborted cross-document view transition promise before page scripts run; it is cosmetic, not an app error.
        if (/ViewTransition opt-in disabled|Transition was aborted/.test(error.message)) return;
        errors.push(error.message);
    });
    await context.addInitScript(({ course }) => {
        if (!localStorage.getItem("beta-db")) {
            localStorage.setItem("beta-db", JSON.stringify({
                tutor_courses: { beta: course }, tutor_roles: { teacher: "teacher", student: "student" },
                tutor_profiles: { teacher: { experience: 3, qualification: "Teaching certificate", about: "Evidence-led practice", imageURL: "" } },
                tutor_public_teachers: { teacher: { displayName: "Beta Teacher" } }
            }));
        }
    }, { course });
    await context.route("**/*", async route => {
        const url = new URL(route.request().url());
        if (url.hostname === "www.gstatic.com" && /firebase-(auth|database|storage|functions)\.js$/.test(url.pathname)) {
            return route.fulfill({ contentType: "text/javascript", body: firebase });
        }
        if (url.origin === "http://127.0.0.1:9460") {
            if (url.pathname.endsWith("/js/firebase-config.js")) return route.fulfill({ contentType: "text/javascript", body: firebase });
            if (/\/js\/(partner-directory|message-notifications|account-menu)\.js$/.test(url.pathname)) {
                return route.fulfill({ contentType: "text/javascript", body: "export const initAccountMenu = () => {}; export const setPartnerVisibility = async () => {}; export const signOutAndRedirect = async () => { location.assign('signup.html'); }; export const resolveDisplayName = (user, profile) => profile.first_name || user?.displayName || 'Learner';" });
            }
            return route.continue();
        }
        if (["fonts.googleapis.com", "fonts.gstatic.com", "cdn.jsdelivr.net", "unpkg.com"].includes(url.hostname)) {
            return route.fulfill({
                contentType: route.request().resourceType() === "stylesheet" ? "text/css" : "text/javascript",
                body: url.pathname.includes("lucide") ? "window.lucide = { createIcons() {} };" : ""
            });
        }
        if (url.hostname === "beta-media.example") return route.fulfill({ contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64") });
        if (url.hostname === "identitytoolkit.googleapis.com" && url.pathname.endsWith("/accounts:signUp")) {
            return route.fulfill({ contentType: "application/json", body: JSON.stringify({ idToken: "beta-anonymous", expiresIn: 3600 }) });
        }
        if (url.hostname === "quickcheck-25590-default-rtdb.asia-southeast1.firebasedatabase.app" && route.request().method() === "GET") {
            return route.fulfill({ contentType: "application/json", headers: { ETag: '"beta-revision"' }, body: "null" });
        }
        if (url.hostname === "firestore.googleapis.com" && route.request().method() === "GET" && url.pathname.startsWith("/v1/projects/quickcheck-25590/databases/(default)/documents/studyPlans/")) {
            return route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { code: 404, status: "NOT_FOUND", message: "No study plan in this fixture." } }) });
        }
        unexpectedRequests.push(`${route.request().method()} ${url.origin}${url.pathname}`);
        return route.abort("blockedbyclient");
    });
    page.betaErrors = errors;
    page.betaUnexpectedRequests = unexpectedRequests;
});

test.afterEach(async ({ page }) => {
    expect(page.betaErrors, "Unexpected browser exceptions").toEqual([]);
    expect(page.betaUnexpectedRequests, "Unmocked external requests were blocked").toEqual([]);
});

test("the local server exposes frontend assets but not backend, fixtures or directory listings", async ({ request }) => {
    const publicPage = await request.get("/toefl-sample/history.html");
    expect(publicPage.status()).toBe(200);
    for (const resource of [
        "/", "/toefl-sample/", "/apps/api-gateway/.env", "/ai_review_server.py",
        "/infra/beta/firebase-mock.js", "/test-results/beta/trace.zip", "/package-lock.json"
    ]) {
        const response = await request.get(resource);
        expect(response.status(), resource).toBe(404);
    }
    const head = await request.head("/package-lock.json");
    expect(head.status()).toBe(405);
});

async function signIn(page) {
    await page.goto("/toefl-sample/signup.html");
    await page.locator("#toggleAuthMode").click();
    await page.locator("#marketplaceRole").selectOption("teacher");
    await page.locator("#email").fill("teacher@example.test");
    await page.locator("#password").fill("beta-password");
    await page.locator("#submitBtn").click();
    await expect(page).toHaveURL(/tutor-check\.html\?studio=1$/);
    await expect(page.locator("#courseGrid")).toHaveAttribute("aria-busy", "false");
}

async function chooseLearningPreferences(page, { viewTracking = false, discoverable = false } = {}) {
    await expect(page.locator("#setupForm")).toBeVisible();
    await page.getByLabel("IELTS Preparation", { exact: true }).check();
    await page.locator("#setupNext").click();
    await page.getByLabel("Intermediate", { exact: true }).check();
    await page.locator("#setupNext").click();
    await page.getByLabel("Speaking", { exact: true }).check();
    await page.locator("#setupNext").click();
    await page.getByLabel("Voice Call", { exact: true }).check();
    await page.locator("#setupNext").click();
    await page.locator('input[name="viewTracking"]').setChecked(viewTracking);
    await page.locator('input[name="discoverable"]').setChecked(discoverable);
}

for (const role of ["student", "teacher"]) {
    test(`new ${role} Google accounts receive skippable learning onboarding`, async ({ page }) => {
        await page.goto(`/toefl-sample/signup.html?role=${role}`);
        await page.evaluate(role => {
            const data = JSON.parse(localStorage.getItem("beta-db"));
            delete data.tutor_roles[role];
            localStorage.setItem("beta-db", JSON.stringify(data));
            localStorage.setItem("beta-google-user", JSON.stringify({ uid: role, email: `${role}@example.test`, emailVerified: true, displayName: "New Member" }));
            localStorage.setItem("beta-google-new", "true");
        }, role);
        await page.locator("#marketplaceRole").selectOption(role);
        await page.locator("#google-signin-button").click();
        await expect(page).toHaveURL(/learning-setup\.html\?welcome=1$/);
        await expect(page.locator("#setupForm")).toBeVisible();
        await expect(page.locator("#stepTitle")).toHaveText("What are you working toward?");
        await expect(page.locator("#setupNext")).toBeDisabled();
        await page.locator("#setupSkip").click();
        await expect(page).toHaveURL(role === "teacher" ? /tutor-check\.html\?studio=1$/ : /toefl-sample\/index\.html$/);
        expect(await page.evaluate(role => JSON.parse(localStorage.getItem("beta-db")).explore_preferences?.[role] || null, role)).toBeNull();
    });
}

test("new email accounts complete interactive onboarding with private defaults and recoverable saves", async ({ page }, testInfo) => {
    await page.goto("/toefl-sample/signup.html?betaActivation=1");
    await page.locator("#firstName").fill("New");
    await page.locator("#lastName").fill("Learner");
    await page.locator("#email").fill("student@example.test");
    await page.locator("#nationality").selectOption("ID");
    await page.locator("#terms").check();
    await page.locator("#password").fill("beta-password");
    await page.locator("#submitBtn").click();
    await expect(page).toHaveURL(/learning-setup\.html\?welcome=1$/);
    await expect(page.locator("#setupForm")).toBeVisible();
    await page.getByLabel("IELTS Preparation", { exact: true }).check();
    await page.locator("#setupNext").click();
    await page.locator("#setupBack").click();
    await expect(page.getByLabel("IELTS Preparation", { exact: true })).toBeChecked();
    await chooseLearningPreferences(page);
    await expect(page.locator('input[name="viewTracking"]')).not.toBeChecked();
    await expect(page.locator('input[name="discoverable"]')).not.toBeChecked();
    await expect(page.locator("#setupReview")).toContainText("IELTS Preparation");
    await page.screenshot({ path: testInfo.outputPath("learning-onboarding-light.png"), fullPage: true });
    await page.evaluate(() => document.documentElement.dataset.theme = "dark");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const contrast = await page.locator("#setupNext").evaluate(button => {
        const style = getComputedStyle(button);
        const luminance = color => {
            const rgb = color.match(/[\d.]+/g).slice(0, 3).map(value => Number(value) / 255);
            const linear = rgb.map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
            return .2126 * linear[0] + .7152 * linear[1] + .0722 * linear[2];
        };
        const a = luminance(style.color), b = luminance(style.backgroundColor);
        return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({ path: testInfo.outputPath("learning-onboarding-dark.png"), fullPage: true });
    await page.evaluate(() => localStorage.setItem("beta-deny-call", "saveExplorePreferences"));
    await page.locator("#setupNext").click();
    await expect(page.locator("#setupError")).toContainText("selections are still here");
    await expect(page.locator("#setupNext")).toBeEnabled();
    await expect(page.locator("#setupReview")).toContainText("IELTS Preparation");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("beta-db")).explore_preferences?.student || null)).toBeNull();
    await page.evaluate(() => localStorage.removeItem("beta-deny-call"));
    await page.locator("#setupNext").click();
    await expect(page).toHaveURL(/toefl-sample\/index\.html$/);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("beta-db")).explore_preferences.student)).toEqual({
        goals: ["IELTS Preparation"], level: "Intermediate", skills: ["Speaking"], styles: ["Voice Call"], viewTracking: false, discoverable: false
    });
});

test("existing accounts can edit onboarding from profile settings without changing data on cancel", async ({ page }) => {
    await signIn(page);
    const preferences = { goals: ["IELTS Preparation"], level: "Intermediate", skills: ["Speaking"], styles: ["Voice Call"], viewTracking: true, discoverable: true };
    await page.evaluate(preferences => {
        const data = JSON.parse(localStorage.getItem("beta-db"));
        data.explore_preferences = { teacher: preferences };
        localStorage.setItem("beta-db", JSON.stringify(data));
    }, preferences);
    await page.goto("/toefl-sample/profile.html");
    await page.locator("#profileSettings").click();
    await page.getByRole("link", { name: "Edit preferences", exact: true }).click();
    await expect(page).toHaveURL(/learning-setup\.html\?from=profile$/);
    await chooseLearningPreferences(page, { viewTracking: true, discoverable: true });
    await expect(page.locator('input[name="viewTracking"]')).toBeChecked();
    await page.locator('input[name="viewTracking"]').uncheck();
    await page.locator("#setupSkip").click();
    await expect(page).toHaveURL(/profile\.html$/);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("beta-db")).explore_preferences.teacher)).toEqual(preferences);
});

test("onboarding load errors expose retry without showing empty saved preferences", async ({ page }) => {
    await signIn(page);
    await page.evaluate(() => localStorage.setItem("beta-deny-call", "getExploreSetup"));
    await page.goto("/toefl-sample/learning-setup.html?from=profile");
    await expect(page.locator("#setupError")).toContainText("Retry before making changes");
    await expect(page.locator("#setupForm")).toBeHidden();
    await page.evaluate(() => localStorage.removeItem("beta-deny-call"));
    await page.locator("#setupRetry").click();
    await expect(page.locator("#setupForm")).toBeVisible();
    await expect(page.locator("#setupError")).toBeHidden();
});

test("onboarding questions can be answered later without inventing matching data", async ({ page }) => {
    await signIn(page);
    await page.goto("/toefl-sample/learning-setup.html?from=explore");
    await expect(page.locator("#setupForm")).toBeVisible();
    for (let index = 0; index < 4; index++) await page.locator("#setupLater").click();
    await expect(page.locator("#setupReview")).toContainText("Not selected");
    await expect(page.locator('input[name="viewTracking"]')).not.toBeChecked();
    await page.locator("#setupNext").click();
    await expect(page).toHaveURL(/social\.html#community$/);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("beta-db")).explore_preferences.teacher)).toEqual({
        goals: [], level: "", skills: [], styles: [], viewTracking: false, discoverable: false
    });
});

test("onboarding visual refinement supports keyboard selection and reduced motion", async ({ page }, testInfo) => {
    await signIn(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/toefl-sample/learning-setup.html?from=profile");
    await expect(page.locator("#setupForm")).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    expect(await page.locator("body").evaluate(body => getComputedStyle(body).fontFamily)).toContain("Plus Jakarta Sans");
    await page.getByLabel("IELTS Preparation", { exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(page.getByLabel("IELTS Preparation", { exact: true })).toBeChecked();
    await page.locator("#setupNext").click();
    await expect(page.locator("#stepTitle")).toBeFocused();
    await expect(page.locator("#stepTitle")).toHaveText("Where are you starting?");
    expect(await page.locator("#setupForm").evaluate(form => form.getAnimations().length)).toBe(0);
    await page.getByLabel("Intermediate", { exact: true }).focus();
    await page.keyboard.press("Space");
    await expect(page.getByLabel("Intermediate", { exact: true })).toBeChecked();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const next = await page.locator("#setupNext").boundingBox();
    expect(next.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: testInfo.outputPath("learning-onboarding-level.png"), fullPage: true });
    await page.setViewportSize({ width: 320, height: 700 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("returning Google accounts go to their dashboard without automatic onboarding", async ({ page }) => {
    await page.goto("/toefl-sample/signup.html");
    await page.evaluate(() => {
        localStorage.setItem("beta-google-user", JSON.stringify({ uid: "teacher", email: "teacher@example.test", emailVerified: true, displayName: "Returning Teacher" }));
        localStorage.setItem("beta-google-new", "false");
    });
    await page.locator("#google-signin-button").click();
    await expect(page).toHaveURL(/tutor-check\.html\?studio=1$/);
});

test("navigation follows the account role across home, marketplace and Explore", async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === "mobile";
    const topLinks = () => page.locator(".qcnav-links a").evaluateAll(links => links.map(link => [link.textContent.trim(), link.getAttribute("href"), link.getAttribute("aria-current")]));
    await signIn(page);
    await page.goto("/toefl-sample/social.html");
    await expect.poll(topLinks).toEqual([
        ["Home", "tutor-check.html?studio=1", null], ["Marketplace", "tutor-check.html", null],
        ["Explore", "social.html#community", "page"], ["Messages", "message.html", null]
    ]);
    await expect(page.locator(".qcnav-brand")).toHaveAttribute("href", "tutor-check.html?studio=1");
    await expect(page.locator('#qcnavTeacherSidebar a[href="tutor-check.html?studio=1&create=1"]')).toHaveCount(1);
    await page.screenshot({ path: testInfo.outputPath("teacher-explore-navigation.png") });
    await expect(page.locator(".tutor-promotion")).toBeHidden();
    await expect(page.locator(".qcnav-upgrade")).toBeHidden();
    if (mobile) {
        const dock = page.locator(".qcnav-dock-teacher");
        await expect(dock).toBeVisible();
        await expect(dock.getByRole("link", { name: "Explore", exact: true })).toHaveAttribute("aria-current", "page");
        await dock.getByRole("link", { name: "Home", exact: true }).click();
    } else {
        await page.locator(".qcnav-links").getByRole("link", { name: "Home", exact: true }).click();
    }
    await expect(page).toHaveURL(/tutor-check\.html\?studio=1$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

    await page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem("beta-db"));
        data.tutor_roles.teacher = "student";
        localStorage.setItem("beta-db", JSON.stringify(data));
    });
    await page.goto("/toefl-sample/social.html");
    await expect.poll(topLinks).toEqual([
        ["Home", "index.html", null], ["Marketplace", "tutor-check.html", null],
        ["Explore", "social.html#community", "page"]
    ]);
    await expect(page.locator("#qcnavTeacherSidebar")).toHaveCount(0);
    await expect(page.locator('a[href="tutor-check.html?classes=1"]')).toHaveCount(0);
    if (!mobile) await expect(page.locator(".tutor-promotion")).toBeVisible();
    if (mobile) await expect(page.locator(".qcnav-dock:not(.qcnav-dock-teacher)")).toBeVisible();
    await page.goto("/toefl-sample/tutor-check.html");
    await expect.poll(topLinks).toEqual([
        ["Home", "index.html", null], ["Marketplace", "tutor-check.html", "page"],
        ["Explore", "social.html#community", null]
    ]);
    await page.locator("#classesTab").click();
    await expect(page).toHaveURL(/classes=1/);
    await expect(page.locator("#classesTab")).toHaveAttribute("aria-current", "page");
    await expect(page.locator("#myClasses")).toBeVisible();
    await expect(page.locator("#catalog")).toBeHidden();
    await expect(page.locator(".qcnav-sidebar")).toBeHidden();
    await expect.poll(topLinks).toEqual([
        ["Home", "index.html", null], ["Marketplace", "tutor-check.html", "page"],
        ["Explore", "social.html#community", null]
    ]);
    await page.goBack();
    await expect(page.locator("#catalog")).toBeVisible();
    await expect(page.locator("#browseTab")).toHaveAttribute("aria-current", "page");
});

test("page transitions keep the shell stable and marketplace views restore focus and scroll", async ({ page }, testInfo) => {
    const mobile = testInfo.project.name === "mobile";
    const lucideRequests = [];
    page.on("request", request => { if (request.url().includes("lucide")) lucideRequests.push(new URL(request.url()).pathname); });
    await page.addInitScript(() => localStorage.setItem("beta-user", JSON.stringify({ uid: "student", email: "student@example.test", emailVerified: true })));
    await page.goto("/toefl-sample/message.html");
    expect(await page.evaluate(() => {
        const top = document.querySelector(".qcnav-topbar");
        return Boolean(top && top.compareDocumentPosition(document.querySelector(".messages-page")) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);
    expect(lucideRequests.every(path => path.includes("/toefl-sample/vendor/lucide/"))).toBe(true);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector(".qcnav-topbar")).viewTransitionName)).toBe("qcnav-top");

    if (!mobile) {
        await page.goto("/toefl-sample/social.html");
        await expect(page.locator("#qcnavSidebar")).toBeHidden();
        await expect(page.locator(".welcome video")).toHaveAttribute("src", /banner%20promo\.mp4|banner promo\.mp4/);
        expect(await page.evaluate(() => getComputedStyle(document.body).paddingLeft)).toBe("0px");
        await page.goto("/toefl-sample/tutor-check.html");
        await expect(page.locator("#courseGrid")).toHaveAttribute("aria-busy", "false");
        await expect(page.locator(".course-hero video")).toHaveAttribute("src", /banner%20promo\.mp4|banner promo\.mp4/);
        await page.goto("/toefl-sample/message.html");
        await page.locator("#qcnavCollapse").click();
        await expect(page.locator("body")).toHaveClass(/qcnav-collapsed/);
        await page.goto("/toefl-sample/profile.html");
        await expect(page.locator("body")).toHaveClass(/qcnav-collapsed/);
        await expect(page.locator("#qcnavCollapse")).toHaveAttribute("aria-label", "Expand sidebar");
        await page.locator("#qcnavCollapse").click();
    }

    await page.goto("/toefl-sample/tutor-check.html");
    await expect(page.locator("#courseGrid")).toHaveAttribute("aria-busy", "false");
    await page.evaluate(() => {
        document.body.style.minHeight = "4000px";
        document.querySelector(".course-title").focus({ preventScroll: true });
        window.scrollTo(0, 300);
    });
    await page.keyboard.press("Enter");
    await expect(page.locator("#coursePage")).toBeVisible();
    await expect(page.locator(".qcnav-sidebar")).toBeHidden();
    await expect(page).toHaveTitle("Beta listening course | Marketplace | Quick Check");
    await expect(page.locator("#coursePage .detail-title")).toBeFocused();
    await page.goBack();
    await expect(page.locator("#browseLayout")).toBeVisible();
    await expect(page).toHaveTitle("Marketplace | Quick Check");
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(300);
});

test("teachers reach Explore from their dashboard and manage their own posts", async ({ page }, testInfo) => {
    await signIn(page);
    await page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem("beta-db"));
        data[".info"] = { connected: true };
        localStorage.setItem("beta-db", JSON.stringify(data));
    });
    await expect(page.locator("#qcnavMarketplaceTeacherSidebar").getByRole("link", { name: "Explore", exact: true })).toHaveAttribute("href", "social.html#community");
    const navigation = page.locator(testInfo.project.name === "mobile" ? "#teacherMobileNav" : ".qcnav-links");
    const explore = navigation.getByRole("link", { name: "Explore", exact: true });
    await expect(explore).toBeVisible();
    if (testInfo.project.name === "mobile") {
        const box = await explore.boundingBox();
        expect(box.width).toBeGreaterThanOrEqual(44);
        expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await explore.click();
    await expect(page).toHaveURL(/social\.html#community$/);
    await expect(page.locator("#exploreControls")).toHaveAttribute("data-explore-state", "ready");
    await page.locator("#postBody").fill("Teacher tips for speaking practice.");
    await page.locator("#publishButton").click();
    const post = page.locator(".post-card").filter({ hasText: "Teacher tips for speaking practice." });
    await expect(post).toBeVisible();
    await post.locator("summary").click();
    await post.getByRole("button", { name: "Edit", exact: true }).click();
    await page.locator("#postBody").fill("Updated teacher speaking tips.");
    await page.locator("#publishButton").click();
    const edited = page.locator(".post-card").filter({ hasText: "Updated teacher speaking tips." });
    await expect(edited).toBeVisible();
    await page.reload();
    const restored = page.locator(".post-card").filter({ hasText: "Updated teacher speaking tips." });
    await expect(restored).toBeVisible();
    await restored.locator("summary").click();
    await restored.getByRole("button", { name: "Remove", exact: true }).click();
    await page.locator("#confirmDelete").click();
    await expect(restored).toHaveCount(0);
    await expect(page.locator("#postFeed")).toContainText("Start the conversation");
});

test("Explore mixes ranked posts, partners and courses and saves matching preferences", async ({ page }, testInfo) => {
    await signIn(page);
    await page.evaluate(({ course }) => {
        const data = JSON.parse(localStorage.getItem("beta-db"));
        data[".info"] = { connected: true };
        data.community_posts = {
            one: { authorId: "student", title: "IELTS practice", body: "Practice speaking every day.", category: "tips", groupId: "", visibility: "public", keywords: ["IELTS", "Speaking"], createdAt: 2, mediaURL: "", mediaPath: "", mediaType: "" },
            two: { authorId: "teacher", title: "Learning progress", body: "My listening progress.", category: "tips", groupId: "", visibility: "public", createdAt: 1, mediaURL: "", mediaPath: "", mediaType: "" }
        };
        data.partnerDirectory = { student: { displayName: "Practice Learner", level: "B1" } };
        localStorage.setItem("beta-db", JSON.stringify(data));
        localStorage.setItem("beta-explore-items", JSON.stringify([
            { type: "post", id: "one" }, { type: "partner", id: "student", profile: data.partnerDirectory.student, matchingScore: 70 },
            { type: "course", id: "beta", course }, { type: "post", id: "two" }
        ]));
    }, { course });
    await page.goto("/toefl-sample/social.html");
    await expect(page.locator("#exploreControls")).toHaveAttribute("data-explore-state", "ready");
    await expect(page.locator("#postFeed > article")).toHaveCount(4);
    expect(await page.locator("#postFeed > article").evaluateAll(nodes => nodes.map(node => node.dataset.recommendation || "post"))).toEqual(["post", "partner", "course", "post"]);
    await expect(page.locator("#postFeed")).toContainText("70% practice match");
    await expect(page.locator("#post-one")).toContainText("IELTS, Speaking");
    await page.getByRole("button", { name: "Following", exact: true }).click();
    await expect(page.getByRole("button", { name: "Following", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#explorePreferencesForm")).toHaveCount(0);
    await page.goto("/toefl-sample/learning-setup.html?from=explore");
    await chooseLearningPreferences(page, { discoverable: true });
    await expect(page.locator('input[name="viewTracking"]')).not.toBeChecked();
    await page.locator("#setupNext").click();
    await expect(page).toHaveURL(/social\.html#community$/);
    await page.reload();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("beta-db")).explore_preferences.teacher)).toMatchObject({ discoverable: true, viewTracking: false, level: "Intermediate" });
    await page.locator("#post-one .post-actions").getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.locator("#post-one .post-actions").getByRole("button", { name: "Saved", exact: true })).toHaveAttribute("aria-pressed", "true");
    await page.screenshot({ path: testInfo.outputPath("explore-recommendations.png"), fullPage: true });
    await page.evaluate(() => document.documentElement.dataset.theme = "dark");
    await page.screenshot({ path: testInfo.outputPath("explore-recommendations-dark.png"), fullPage: true });
});
test("Explore recommendation errors expose retry and the composer has no keyword picker or explanation", async ({ page }) => {
    await signIn(page);
    await page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem("beta-db"));
        data[".info"] = { connected: true };
        data.community_posts = {};
        localStorage.setItem("beta-db", JSON.stringify(data));
        localStorage.setItem("beta-deny-call", "getExploreFeed");
    });
    await page.goto("/toefl-sample/social.html");
    await expect(page.locator("#exploreError")).toContainText("unavailable");
    await expect(page.locator("#exploreStatus")).toContainText("chronologically");
    await page.evaluate(() => localStorage.removeItem("beta-deny-call"));
    await page.locator("#refreshExplore").click();
    await expect(page.locator("#exploreControls")).toHaveAttribute("data-explore-state", "ready");
    await expect(page.locator("#exploreStatus")).toBeHidden();
    await expect(page.locator("#postKeywords")).toHaveCount(0);
    await expect(page.locator("body")).not.toContainText("Learning keywords");
    await expect(page.locator("body")).not.toContainText("Following uses your accepted connections");
    await expect(page.locator("body")).not.toContainText("Recommendations use a recent");
    await expect(page.getByRole("link", { name: "Edit learning preferences", exact: true })).toHaveCount(0);
    await page.locator("#postBody").fill("My English practice tips.");
    await page.locator("#publishButton").click();
    await expect(page.locator("#postFeed")).toContainText("My English practice tips.");
    expect(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("beta-db")).community_posts).map(post => post.keywords || []))).toEqual([[]]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("beta-call-counts")).recordExploreInteraction || 0)).toBe(0);
});

test("Explore keeps existing keywords when recommendations fail during post editing", async ({ page }) => {
    await signIn(page);
    await page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem("beta-db"));
        data[".info"] = { connected: true };
        data.community_posts = {
            one: { authorId: "teacher", body: "My speaking practice.", category: "tips", groupId: "", visibility: "public", keywords: ["IELTS", "Speaking"], createdAt: Date.now() }
        };
        localStorage.setItem("beta-db", JSON.stringify(data));
        localStorage.setItem("beta-deny-call", "getExploreFeed");
    });
    await page.goto("/toefl-sample/social.html");
    await expect(page.locator("#exploreError")).toContainText("unavailable");
    await page.locator("#post-one summary").click();
    await page.locator("#post-one").getByRole("button", { name: "Edit", exact: true }).click();
    await expect(page.locator("#postKeywords")).toHaveCount(0);
    await page.locator("#postBody").fill("Updated speaking practice.");
    await page.locator("#publishButton").click();
    await expect(page.locator("#post-one")).toContainText("Updated speaking practice.");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("beta-db")).community_posts.one.keywords)).toEqual(["IELTS", "Speaking"]);
});

test("Explore viewing signals require consent and continuous foreground dwell without duplicates", async ({ page }) => {
    await signIn(page);
    await page.evaluate(() => {
        const data = JSON.parse(localStorage.getItem("beta-db"));
        data[".info"] = { connected: true };
        data.community_posts = {
            one: { authorId: "student", body: "Practice speaking every day.", category: "tips", groupId: "", visibility: "public", createdAt: Date.now() }
        };
        localStorage.setItem("beta-db", JSON.stringify(data));
    });
    await page.clock.install();
    await page.goto("/toefl-sample/social.html");
    await expect(page.locator("#exploreControls")).toHaveAttribute("data-explore-state", "ready");
    const views = () => page.evaluate(() => JSON.parse(localStorage.getItem("beta-call-counts") || "{}").recordExploreInteraction || 0);
    await page.locator("#post-one").scrollIntoViewIfNeeded();
    await page.clock.runFor(12000);
    expect(await views()).toBe(0);
    await page.goto("/toefl-sample/learning-setup.html?from=explore");
    await chooseLearningPreferences(page, { viewTracking: true });
    await page.locator("#setupNext").click();
    await expect(page).toHaveURL(/social\.html#community$/);
    await expect(page.locator("#exploreControls")).toHaveAttribute("data-explore-state", "ready");
    await page.locator("#post-one").scrollIntoViewIfNeeded();
    await page.waitForTimeout(100);
    await page.clock.runFor(9000);
    expect(await views()).toBe(0);
    await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    await page.clock.runFor(12000);
    expect(await views()).toBe(0);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await page.waitForTimeout(100);
    await page.clock.runFor(9000);
    expect(await views()).toBe(0);
    await page.clock.runFor(3000);
    await expect.poll(views).toBe(1);
    await page.clock.runFor(12000);
    expect(await views()).toBe(1);
    await page.goto("/toefl-sample/learning-setup.html?from=explore");
    await chooseLearningPreferences(page, { viewTracking: false });
    await page.locator("#setupNext").click();
    await expect(page).toHaveURL(/social\.html#community$/);
    await expect(page.locator("#exploreControls")).toHaveAttribute("data-explore-state", "ready");
    await page.locator("#postBody").fill("A new post after disabling viewing.");
    await page.locator("#publishButton").click();
    const newPost = page.locator(".post-card").filter({ hasText: "A new post after disabling viewing." });
    await expect(newPost).toBeVisible();
    await newPost.scrollIntoViewIfNeeded();
    await page.clock.runFor(12000);
    expect(await views()).toBe(1);
});

test("sign-in errors stay visible; successful login edits the live course and survives reload", async ({ page }) => {
    await page.goto("/toefl-sample/signup.html");
    await page.locator("#toggleAuthMode").click();
    await page.locator("#email").fill("teacher@example.test");
    await page.locator("#password").fill("wrong-password");
    await page.locator("#submitBtn").click();
    await expect(page.locator("#auth-message")).toContainText("email or password is incorrect");
    await expect(page.locator("#submitBtn")).toBeEnabled();
    await page.locator("#marketplaceRole").selectOption("teacher");
    await page.locator("#password").fill("beta-password");
    await page.locator("#submitBtn").click();
    await expect(page).toHaveURL(/tutor-check\.html\?studio=1$/);
    await expect(page.locator("#courseGrid")).toHaveAttribute("aria-busy", "false");
    await page.goto("/toefl-sample/tutor-check.html?course=beta");
    await page.getByRole("button", { name: "Edit course title", exact: true }).click();
    const before = page.url();
    await page.locator('#courseForm [name="title"]').fill("Updated beta course");
    await page.locator("#saveCourseButton").click();
    await expect(page.locator("#courseEditor")).toBeHidden();
    await expect(page.locator("#courseDetail")).toContainText("Updated beta course");
    const courseFacts = page.locator("#courseDetail .course-detail-facts");
    await expect(page.locator("#courseDetail .quick-stats")).toHaveCount(0);
    await expect(courseFacts).toContainText("08.00 – 10.00");
    await expect(courseFacts.locator(".course-detail-fact-label")).toHaveText(["Hari", "Jam", "Mulai", "Mode", "Kuota"]);
    await expect(courseFacts.getByRole("button", { name: "Edit class days" })).toBeVisible();
    await expect(page.locator("#courseDetail .detail-intro-copy > .course-detail-facts")).toHaveCount(1);
    await page.getByRole("button", { name: "Edit class time" }).click();
    await expect(page.locator('#courseForm [name="startTime"]')).toHaveValue("08:00");
    await page.locator('#courseForm [name="startTime"]').fill("09:00");
    await page.locator('#courseForm [name="endTime"]').fill("11:00");
    await page.locator('.course-inline-control[data-edit-field="startTime"]').getByRole("button", { name: "Done" }).click();
    await page.locator("#saveCourseButton").click();
    await expect(page.locator("#courseDetail .course-detail-facts")).toContainText("09.00 – 11.00");
    await page.getByRole("button", { name: "Edit class capacity" }).click();
    await page.locator('#courseForm [name="maxStudents"]').fill("8");
    await page.locator('.course-inline-control[data-edit-field="maxStudents"]').getByRole("button", { name: "Done" }).click();
    await page.locator("#saveCourseButton").click();
    await expect(page.locator("#courseDetail .course-detail-facts")).toContainText("0 / 8");
    await expect(page.getByRole("progressbar", { name: "Class capacity" })).toHaveAttribute("aria-valuemax", "8");
    expect(page.url()).toBe(before);
    await page.reload();
    await expect(page.locator("#courseDetail")).toContainText("Updated beta course");
    await expect(page.locator("#courseDetail .course-detail-facts")).toContainText("09.00 – 11.00");
    await expect(page.locator("#courseDetail .course-detail-facts")).toContainText("0 / 8");
});

test("failed course saves keep the inline edit open; learners cannot see owner controls", async ({ page }) => {
    await signIn(page);
    await page.goto("/toefl-sample/tutor-check.html?course=beta");
    await page.getByRole("button", { name: "Edit course title", exact: true }).click();
    await page.locator('#courseForm [name="title"]').fill("Unsaved beta edit");
    await page.evaluate(() => localStorage.setItem("beta-deny-write", "true"));
    await page.locator("#saveCourseButton").click();
    await expect(page.locator("#editorError")).toContainText("rejected");
    await expect(page.locator('#courseForm [name="title"]')).toHaveValue("Unsaved beta edit");
    await expect(page.locator("#saveCourseButton")).toBeEnabled();
    await page.evaluate(() => {
        localStorage.removeItem("beta-deny-write");
        localStorage.setItem("beta-user", JSON.stringify({ uid: "student", email: "student@example.test", emailVerified: true }));
    });
    await page.reload();
    await expect(page.locator("#courseDetail")).toContainText("Beta listening course");
    await expect(page.getByRole("button", { name: "Edit course title", exact: true })).toHaveCount(0);
});
test("private drafts save incomplete courses, survive reload and leave published listings untouched", async ({ page }) => {
        await signIn(page);
        await page.goto("/toefl-sample/tutor-check.html?course=beta");
        await page.getByRole("button", { name: "Edit course title", exact: true }).click();
        await page.locator('#courseForm [name="title"]').fill("Private replacement title");
        await page.locator("#saveDraftButton").click();
        await expect(page.locator("#courseEditor")).toBeHidden();
        const draft = page.locator("#ownCourses .studio-course").filter({ hasText: "Private replacement title" });
        await expect(draft).toContainText("Private draft");
        const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("beta-db")));
        expect(stored.tutor_courses.beta.title).toBe(course.title);
        expect(Object.values(stored.tutor_drafts.teacher)).toHaveLength(1);
        await page.reload();
        await draft.getByRole("button", { name: "Resume draft" }).click();
        await expect(page.locator('#courseForm [name="title"]')).toHaveValue("Private replacement title");
        await page.locator("#saveCourseButton").click();
        await expect(page.locator("#courseEditor")).toBeHidden();
        await expect(page.locator("#courseDetail")).toContainText("Private replacement title");
        expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("beta-db")).tutor_drafts.teacher))).toEqual([]);

        await page.goto("/toefl-sample/tutor-check.html?studio=1");
        await page.locator("#newCourse").click();
        await page.locator('#courseForm [name="title"]').fill("Unfinished course");
        await page.evaluate(() => localStorage.setItem("beta-deny-write", "true"));
        await page.locator("#saveDraftButton").click();
        await expect(page.locator("#editorError")).toContainText("rejected");
        await expect(page.locator('#courseForm [name="title"]')).toHaveValue("Unfinished course");
        await page.evaluate(() => localStorage.removeItem("beta-deny-write"));
        await page.locator("#saveDraftButton").click();
        await expect(page.locator("#courseEditor")).toBeHidden();
        await page.reload();
        const unfinished = page.locator("#ownCourses .studio-course").filter({ hasText: "Unfinished course" });
        await unfinished.getByRole("button", { name: "Resume draft" }).click();
        await expect(page.locator('#courseForm [name="summary"]')).toHaveValue("");
        await page.locator("#saveCourseButton").click();
        await expect(page.locator("#courseEditor")).toBeVisible();
        expect(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("beta-db")).tutor_courses).some(row => row.title === "Unfinished course"))).toBe(false);
        await page.locator("#cancelCourseEdit").click();
        page.once("dialog", dialog => dialog.accept());
        await unfinished.getByRole("button", { name: "Delete draft" }).click();
        await expect(unfinished).toHaveCount(0);
});

test("private draft previews restore after reload and become public only on publishing", async ({ page }) => {
    await signIn(page);
    await page.goto("/toefl-sample/tutor-check.html?course=beta");
    await page.getByRole("button", { name: "Edit course title", exact: true }).click();
    await page.locator('#courseForm [name="previewFile"]').setInputFiles({
        name: "draft.png", mimeType: "image/png",
        buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64")
    });
    await page.locator("#saveDraftButton").click();
    await expect(page.locator("#courseEditor")).toBeHidden();
    const draft = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("beta-db")).tutor_drafts.teacher)[0]);
    expect(draft.previewPath).toMatch(/^tutor-drafts\/teacher\//);
    expect(draft.previewURL).toBe("");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("beta-db")).tutor_courses.beta.previewURL)).toBe("");
    await page.reload();
    await page.getByRole("button", { name: "Resume draft", exact: true }).click();
    await expect(page.locator("#mediaPreview img")).toHaveAttribute("src", /^blob:/);
    await page.evaluate(() => localStorage.setItem("beta-deny-write", "true"));
    await page.locator("#saveCourseButton").click();
    await expect(page.locator("#editorError")).toContainText("rejected");
    expect(await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem("beta-db")).tutor_drafts.teacher))).toHaveLength(1);
    expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("beta-media"))))).toEqual([draft.previewPath]);
    await page.evaluate(() => localStorage.removeItem("beta-deny-write"));
    await page.locator("#saveCourseButton").click();
    await expect(page.locator("#courseEditor")).toBeHidden();
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("beta-db")).tutor_courses.beta);
    expect(saved.previewPath).toMatch(/^tutor-courses\/teacher\//);
    expect(saved.previewURL).toMatch(/^https:/);
    expect(await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("beta-media"))))).toEqual([saved.previewPath]);
});

test("tutor home shows real teaching data, filters courses and keeps editing inline", async ({ page }, testInfo) => {
    await page.addInitScript(({ course }) => {
        const db = JSON.parse(localStorage.getItem("beta-db"));
        db.tutor_courses.beta.type = "live";
        db.tutor_courses.draft = { ...course, title: "Draft course", published: false };
        db.tutor_courses.archived = { ...course, title: "Archived course", published: false, archived: true };
        db.tutor_requests = {
            beta_learner: { courseId: "beta", teacherId: "teacher", studentId: "learner", studentName: "Beta Learner", status: "accepted", price: 100000, createdAt: 1 },
            draft_learner: { courseId: "draft", teacherId: "teacher", studentId: "learner", studentName: "Beta Learner", status: "accepted", price: 100000, createdAt: 2 }
        };
        db.tutor_reviews = { beta: { learner: { rating: 4, text: "Helpful lesson", studentName: "Beta Learner", updatedAt: 3 } } };
        localStorage.setItem("beta-db", JSON.stringify(db));
    }, { course });
    await signIn(page);
    await expect(page.locator("#teacherStudio")).toBeVisible();
    await expect(page.locator("#studioTitle")).toContainText("Beta");
    await expect(page.locator("#studioMetrics .studio-metric").nth(0)).toContainText("1");
    await expect(page.locator("#studioMetrics .studio-metric").nth(1).locator("strong")).toHaveText("1");
    await expect(page.locator("#studioMetrics")).toContainText("Not tracked");
    await expect(page.locator("#studioMetrics")).toContainText("4.0 / 5");
    await expect(page.locator("#studioClasses")).toContainText("Beta listening course");
    await expect(page.locator("#studioActivity")).toContainText("4-star review");
    await page.evaluate(async () => {
        const { ref, set, db } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js");
        await set(ref(db, "tutor_reviews/beta/learner"), { rating: 5, text: "Updated review", studentName: "Beta Learner", updatedAt: 4 });
    });
    await expect(page.locator("#studioMetrics")).toContainText("5.0 / 5");
    await expect(page.locator("#studioActivity")).toContainText("5-star review");
    await expect(page.locator("#ownCourses .studio-course")).toHaveCount(3);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("tutor-home-all-courses.png"), fullPage: true });
    await page.getByRole("button", { name: "Drafts", exact: true }).click();
    await expect(page.locator("#ownCourses .studio-course")).toHaveCount(1);
    await expect(page.locator("#ownCourses")).toContainText("Draft course");
    await page.getByRole("button", { name: "Published", exact: true }).click();
    await expect(page.locator("#ownCourses")).toContainText("Beta listening course");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: testInfo.outputPath("tutor-home-light.png"), fullPage: true });
    await page.evaluate(() => document.documentElement.dataset.theme = "dark");
    const contrast = await page.locator("#newCourse").evaluate(button => {
        const style = getComputedStyle(button);
        const luminance = color => {
            const channels = color.match(/\d+/g).slice(0, 3).map(Number).map(value => value / 255)
                .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
            return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
        };
        const a = luminance(style.color), b = luminance(style.backgroundColor);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath("tutor-home-dark.png"), fullPage: true });
    await page.locator("#ownCourses").getByRole("button", { name: "Edit course", exact: true }).click();
    await expect(page.locator("#editorCanvas")).toBeVisible();
    await expect(page.locator("body")).not.toHaveClass(/tutor-home/);
    if (testInfo.project.name === "mobile") {
        await page.locator("#teacherMobileHome").click();
        await expect(page.locator("#teacherStudio")).toBeVisible();
        await page.locator("#teacherMobileCreate").click();
        await expect(page.locator("#editorCanvas")).toBeVisible();
        await page.locator("#teacherMobileLearners").click();
        await expect(page.locator("#teacherStudio")).toBeVisible();
    }
});

test("existing tutors keep their teacher home when signing in with the default student selection", async ({ page }) => {
    await page.goto("/toefl-sample/signup.html");
    await page.locator("#toggleAuthMode").click();
    await page.locator("#email").fill("teacher@example.test");
    await page.locator("#password").fill("beta-password");
    await page.locator("#submitBtn").click();
    await expect(page).toHaveURL(/tutor-check\.html\?studio=1$/);
    await expect(page.locator("#teacherStudio")).toBeVisible();
});

test("marketplace read failures can be retried without losing the course link", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("beta-deny-read", "tutor_reviews"));
    await page.goto("/toefl-sample/tutor-check.html?course=beta");
    await expect(page.locator("#marketConnectionError")).toBeVisible();
    await expect(page.locator("#marketConnectionError")).toContainText("could not");
    await page.evaluate(() => localStorage.removeItem("beta-deny-read"));
    await page.getByRole("button", { name: "Retry course connection" }).click();
    await expect(page.locator("#courseDetail")).toContainText("Beta listening course");
    await expect(page.locator("#marketConnectionError")).toBeHidden();
});

test("enrollment cancellation errors stay inside the open dialog and can be retried", async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem("beta-user", JSON.stringify({ uid: "student", email: "student@example.test", emailVerified: true }));
        const db = JSON.parse(localStorage.getItem("beta-db"));
        db.tutor_requests = {
            beta_student: { courseId: "beta", teacherId: "teacher", studentId: "student", studentName: "Beta Learner", status: "pending", price: 100000, createdAt: 1 }
        };
        localStorage.setItem("beta-db", JSON.stringify(db));
        localStorage.setItem("beta-deny-write", "true");
    });
    await page.goto("/toefl-sample/tutor-check.html?classes=1");
    const classes = page.locator("#myClasses");
    await expect(classes).toBeVisible();
    await expect(page.locator("#requestsDialog")).toHaveCount(0);
    await expect(classes).toContainText("Waiting for the teacher");
    await classes.getByRole("button", { name: "Cancel request", exact: true }).click();
    await expect(classes.getByRole("alert")).toBeVisible();
    await expect(classes.getByRole("alert")).toContainText("rejected");
    await page.evaluate(() => localStorage.removeItem("beta-deny-write"));
    await classes.getByRole("button", { name: "Cancel request", exact: true }).click();
    await expect(classes.locator(".class-group")).toContainText("Past requests");
    await expect(classes).toContainText("Cancelled");
});

test("profile review preserves in-flight state during live updates and supports failed-status retry", async ({ page }) => {
    await signIn(page);
    await page.evaluate(() => localStorage.setItem("beta-deny-call", "getTutorVerificationStatus"));
    await page.goto("/toefl-sample/tutor-check.html?studio=1");
    await expect(page.locator("#verificationError")).toContainText("unavailable");
    await expect(page.locator("#requestVerificationButton")).toBeHidden();
    await page.evaluate(() => localStorage.removeItem("beta-deny-call"));
    await page.getByRole("button", { name: "Refresh profile review status" }).click();
    await expect(page.locator("#requestVerificationButton")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.evaluate(() => localStorage.setItem("beta-call-delay", "1500"));
    await page.locator("#requestVerificationButton").click();
    await page.evaluate(async () => {
        const { ref, set, db } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js");
        await set(ref(db, "tutor_course_stats/beta/students"), 1);
    });
    await expect(page.locator("#requestVerificationButton")).toBeDisabled();
    await expect(page.locator("#verificationStatus")).toContainText("waiting for moderator");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("beta-call-counts")).requestTutorVerification)).toBe(1);
});

test("moderator rejection errors stay next to the queue and a successful decision removes the request", async ({ page }) => {
    await page.addInitScript(() => {
        localStorage.setItem("beta-user", JSON.stringify({ uid: "moderator", email: "quickcheck.edu@gmail.com", emailVerified: true, role: "developer" }));
        localStorage.setItem("beta-verification-queue", JSON.stringify([
            { uid: "teacher", displayName: "Beta Teacher", email: "teacher@example.test", qualification: "Teaching certificate", experience: 3, about: "Practice", requestedAt: 1 }
        ]));
        localStorage.setItem("beta-deny-call", "listTutorVerificationRequests");
    });
    await page.goto("/toefl-sample/tutor-check.html");
    const panel = page.locator("#moderatorVerificationPanel");
    await expect(panel.getByRole("alert")).toContainText("could not load");
    await page.evaluate(() => localStorage.removeItem("beta-deny-call"));
    await page.getByRole("button", { name: "Refresh review queue", exact: true }).click();
    await expect(panel.getByRole("alert")).toBeHidden();
    await panel.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(panel.getByRole("alert")).toContainText("reason");
    await panel.getByRole("textbox").fill("Please complete your teaching profile.");
    await panel.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(panel).toContainText("no pending tutor profile reviews");
    await expect(panel.getByRole("alert")).toBeHidden();
});

test("learners browse and filter courses, open teacher details and enroll from the cart", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("beta-user", JSON.stringify({ uid: "student", email: "student@example.test", emailVerified: true })));
    await page.goto("/toefl-sample/tutor-check.html");
    const courseCard = page.locator(".course-card").first();
    await expect(courseCard.locator(".course-facts .course-fact-label")).toHaveText(["Jam", "Hari", "Mulai", "Kuota"]);
    await expect(courseCard.locator(".course-type-badge")).toContainText("Online");
    await expect(courseCard.locator(".course-rating-badge strong")).toHaveText("0");
    await expect(courseCard.locator(".course-rating-badge")).not.toContainText("New");
    await expect(courseCard.locator(".course-rating-badge span")).toHaveCount(0);
    await expect(courseCard).toContainText("08.00 – 10.00");
    await expect(courseCard).toContainText("Mon, Wed, Fri");
    await expect(courseCard).toContainText("0 / 5");
    const courseFactRows = await courseCard.locator(".course-fact").evaluateAll(nodes => nodes.map(node => node.getBoundingClientRect().top));
    expect(Math.abs(courseFactRows[0] - courseFactRows[1])).toBeLessThan(1);
    expect(Math.abs(courseFactRows[2] - courseFactRows[3])).toBeLessThan(1);
    expect(courseFactRows[0]).toBeLessThan(courseFactRows[2]);
    const timeFact = courseCard.locator(".course-fact").first();
    await expect(timeFact.locator(".course-fact-heading .course-fact-label")).toHaveText("Jam");
    await expect(timeFact.locator(".course-fact-copy .course-fact-value")).toHaveText("08.00 – 10.00");
    const factLayout = await timeFact.evaluate(node => ({
        heading: getComputedStyle(node.querySelector(".course-fact-heading")).display,
        headingTop: node.querySelector(".course-fact-heading").getBoundingClientRect().top,
        headingLeft: node.querySelector(".course-fact-heading").getBoundingClientRect().left,
        valueTop: node.querySelector(".course-fact-value").getBoundingClientRect().top,
        valueLeft: node.querySelector(".course-fact-value").getBoundingClientRect().left,
        iconLeft: node.querySelector(":scope > .ti").getBoundingClientRect().left
    }));
    expect(factLayout.heading).toBe("block");
    expect(factLayout.valueTop).toBeGreaterThan(factLayout.headingTop);
    expect(factLayout.iconLeft).toBeLessThan(factLayout.headingLeft);
    expect(Math.abs(factLayout.valueLeft - factLayout.headingLeft)).toBeLessThan(1);
    const courseGridColumns = await page.locator(".course-grid").evaluate(node => getComputedStyle(node).gridTemplateColumns.split(" ").length);
    if (page.viewportSize().width >= 1200) expect(courseGridColumns).toBe(4);
    else if (page.viewportSize().width > 640) expect(courseGridColumns).toBeGreaterThanOrEqual(2);
    const filterLayout = await page.locator(".filter-panel").evaluate(node => ({
        position: getComputedStyle(node).position,
        overflowY: getComputedStyle(node).overflowY,
        width: node.getBoundingClientRect().width
    }));
    expect(filterLayout.position).toBe(page.viewportSize().width > 780 ? "fixed" : "static");
    expect(filterLayout.overflowY).toBe(page.viewportSize().width > 780 ? "auto" : "visible");
    expect(filterLayout.width).toBeGreaterThan(200);
    await expect(page.getByRole("searchbox", { name: "Search courses and teachers" })).toBeVisible();
    await expect(page.locator("#topCourseSearch, #teacherSignup, #favoritesButton")).toHaveCount(0);
    const courseSearch = page.getByRole("searchbox", { name: "Search courses and teachers" });
    await courseSearch.fill("Beta listening");
    await expect(courseCard).toContainText("Beta listening course");
    await courseSearch.fill("no matching course");
    await expect(page.locator("#courseGrid")).toContainText("No matching courses");
    await courseSearch.fill("");
    await expect(courseCard).toContainText("Beta listening course");
    await page.locator('[name="rating"][value="5"]').check();
    await expect(page.locator("#courseGrid")).toContainText("No matching courses");
    await page.locator("#courseGrid").getByRole("button", { name: "Clear all filters", exact: true }).click();
    await page.locator(".course-title").click();
    await page.getByRole("tab", { name: "About teacher", exact: true }).click();
    await expect(page.getByRole("link", { name: "View teacher profile", exact: true })).toHaveAttribute("href", "profile.html?uid=teacher");
    await expect(page.locator("#courseDetail")).toContainText("Teaching certificate");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole("button", { name: "Add to cart", exact: true }).click();
    await expect(page.locator("#cartCount")).toHaveText("1");
    await page.locator("#cartButton").click();
    await page.locator("#checkoutButton").click();
    await expect(page.locator("#cartStatus")).toContainText("1 enrollment request sent. No payment was collected.");
    await expect(page.locator("#cartItems")).toContainText("Your cart is empty");
    await page.getByRole("button", { name: "Close cart", exact: true }).click();
    await page.locator("#classesTab").click();
    await expect(page.locator(".market-search")).toBeHidden();
    await expect(page.locator("#classesContent")).toContainText("Beta listening course");
    await expect(page.locator("#classesContent")).toContainText("Waiting for teacher");
    await expect(page.locator("#classesCount")).toHaveText("1");
    await page.reload();
    await expect(page.locator("#myClasses")).toBeVisible();
    await expect(page.locator("#classesContent .class-card")).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator("#classesContent").getByRole("button", { name: "View course", exact: true }).click();
    await expect(page.locator("#coursePage")).toBeVisible();
    await page.goBack();
    await expect(page.locator("#myClasses")).toBeVisible();
});

test("partial checkout keeps failed courses retryable and does not resend successful enrollments", async ({ page }) => {
    await page.addInitScript(({ course }) => {
        localStorage.setItem("beta-user", JSON.stringify({ uid: "student", emailVerified: true }));
        const db = JSON.parse(localStorage.getItem("beta-db"));
        db.tutor_courses.second = { ...course, title: "Second listening course" };
        db.tutor_library = { student: { cart: { beta: true, second: true } } };
        localStorage.setItem("beta-db", JSON.stringify(db));
        localStorage.setItem("beta-deny-write-path", "tutor_requests/second_student");
    }, { course });
    await page.goto("/toefl-sample/tutor-check.html");
    await expect(page.locator("#cartCount")).toHaveText("2");
    await page.locator("#cartButton").click();
    await page.locator("#checkoutButton").click();
    await expect(page.locator("#cartError")).toContainText("Second listening course");
    await expect(page.locator("#cartStatus")).toContainText("1 enrollment request sent");
    await expect(page.locator("#cartItems .request-row")).toHaveCount(1);
    await expect(page.locator("#cartItems")).toContainText("Second listening course");
    const first = await page.evaluate(() => JSON.parse(localStorage.getItem("beta-db")).tutor_requests.beta_student);
    await page.evaluate(() => localStorage.removeItem("beta-deny-write-path"));
    await page.locator("#checkoutButton").click();
    await expect(page.locator("#cartItems")).toContainText("Your cart is empty");
    await expect(page.locator("#cartError")).toBeHidden();
    const requests = await page.evaluate(() => JSON.parse(localStorage.getItem("beta-db")).tutor_requests);
    expect(Object.keys(requests)).toHaveLength(2);
    expect(requests.beta_student).toEqual(first);
});

test("booking stays disabled during live updates and completion does not change another course", async ({ page }) => {
    await page.addInitScript(({ course }) => {
        localStorage.setItem("beta-user", JSON.stringify({ uid: "student", emailVerified: true }));
        const db = JSON.parse(localStorage.getItem("beta-db"));
        db.tutor_courses.second = { ...course, title: "Second listening course" };
        localStorage.setItem("beta-db", JSON.stringify(db));
    }, { course });
    await page.goto("/toefl-sample/tutor-check.html?course=beta");
    await page.evaluate(() => localStorage.setItem("beta-write-delay", "2000"));
    await page.getByRole("button", { name: "Book a class", exact: true }).click();
    await page.evaluate(async () => {
        localStorage.removeItem("beta-write-delay");
        const { ref, set, db } = await import("https://www.gstatic.com/firebasejs/10.8.0/firebase-database.js");
        await set(ref(db, "tutor_course_stats/beta/students"), 1);
    });
    await expect(page.getByRole("button", { name: "Book a class", exact: true })).toBeDisabled();
    await page.locator("#backToCatalog").click();
    await page.getByRole("button", { name: "Second listening course", exact: true }).click();
    await expect.poll(() => page.evaluate(() => Boolean(JSON.parse(localStorage.getItem("beta-db")).tutor_requests?.beta_student))).toBe(true);
    await expect(page.locator("#courseDetail .detail-feedback")).toHaveText("");
    await expect(page.locator("#courseDetail")).toContainText("Second listening course");
});

test("recorded practice results populate history, filters and review routing without crossing accounts", async ({ page }) => {
    await signIn(page);
    await page.goto("/toefl-sample/history.html");
    await page.evaluate(result => window.toeflTestHistory.record(result), practiceResult);
    await page.locator("#practiceTab").click();
    await expect(page.locator(".attempt-card")).toHaveCount(1);
    await expect(page.locator(".score-number")).toContainText("1");
    await page.reload();
    await page.locator("#practiceTab").click();
    await expect(page.locator(".attempt-card")).toHaveCount(1);
    await page.locator("#historySearch").fill("missing");
    await expect(page.locator(".attempt-card")).toHaveCount(0);
    await page.locator("#historySearch").fill("");
    const link = page.getByRole("link", { name: "View Result" });
    await expect(link).toHaveAttribute("href", /section\+?2|section%202|section 2|full-test-summary/);
    await expect(link).toHaveAttribute("href", /setId=beta-practice/);
    await link.click();
    await expect(page).toHaveURL(/full-test-summary\.html.*setId=beta-practice/);
    await page.getByRole("link", { name: "View Explanation" }).click();
    await expect(page).toHaveURL(/section%202-answered\.html.*setId=beta-practice/);
    await expect(page.locator("#aiqcFab")).toBeVisible();
    await page.evaluate(() => localStorage.setItem("beta-user", JSON.stringify({ uid: "other-student", email: "other@example.test" })));
    await page.goto("/toefl-sample/history.html");
    await page.locator("#practiceTab").click();
    await expect(page.locator(".attempt-card")).toHaveCount(0);
});

test("AI feedback uses authenticated mock calls and shows quota errors without retries", async ({ context, page }) => {
    await signIn(page);
    await page.evaluate(result => localStorage.setItem("toefl_section2_result", JSON.stringify(result)), practiceResult);
    await page.goto("/toefl-sample/section 2-answered.html");
    let calls = 0;
    await context.route(aiEndpoint, route => {
        calls++;
        expect(route.request().headers().authorization).toBe("Bearer beta-token-teacher");
        return route.fulfill({
            status: calls === 1 ? 200 : 429, contentType: "application/json",
            body: JSON.stringify(calls === 1 ? { reply: "Use the singular verb with she." } : { detail: "Your AI daily limit is reached" })
        });
    });
    await page.getByRole("button", { name: "Open AI QC tutor" }).click();
    await page.locator("#aiqcInput").fill("Which verb matches she?");
    await page.getByRole("button", { name: "Send question" }).click();
    await expect(page.locator("#aiqcThread")).toContainText("Use the singular verb with she.");
    await page.locator("#aiqcInput").fill("Explain again");
    await page.getByRole("button", { name: "Send question" }).click();
    await expect(page.locator("#aiqcThread")).toContainText("Your AI daily limit is reached");
    expect(calls).toBe(2);
});

test("new courses are created in place, outcomes are editable, and archive removes only that listing", async ({ page }) => {
    await signIn(page);
    await page.goto("/toefl-sample/tutor-check.html?studio=1");
    await page.locator("#newCourse").click();
    await expect(page.locator("#editorCanvas")).toBeVisible();
    for (const [label, field, value] of [
        ["course title", "title", "New beta course"],
        ["course description", "summary", "Structured listening practice."],
        ["schedule", "schedule", "Study at your own pace"]
    ]) {
        if (field !== "title") {
            await page.locator("#editorCanvas").getByRole("button", { name: `Edit ${label}`, exact: true }).click();
        }
        await page.locator(`#courseForm [name="${field}"]`).fill(value);
    }
    await page.locator("#editorCanvas").getByRole("button", { name: "Add outcome", exact: true }).click();
    await page.getByRole("textbox", { name: "outcome 1", exact: true }).fill("Recognize the main idea");
    await page.locator("#editorCanvas").getByRole("button", { name: "Edit curriculum", exact: true }).click();
    await page.locator("#editorCanvas").getByRole("button", { name: "Add lesson", exact: true }).click();
    await page.getByRole("textbox", { name: "lesson 1", exact: true }).fill("Short dialogues");
    await page.locator("#editorCanvas").getByRole("button", { name: "Edit course price", exact: true }).click();
    await page.locator('#courseForm [name="price"]').fill("50000");
    await page.locator("#saveCourseButton").click();
    await expect(page.locator("#courseEditor")).toBeHidden();
    await expect(page.locator("#courseDetail")).toContainText("New beta course");
    await page.getByRole("tab", { name: "Overview", exact: true }).click();
    await page.getByRole("button", { name: "Add outcome", exact: true }).click();
    await page.getByRole("textbox", { name: "outcome 2", exact: true }).fill("Find supporting details");
    await page.locator("#saveCourseButton").click();
    await expect(page.locator("#courseDetail")).toContainText("Find supporting details");
    await page.getByRole("button", { name: "Remove outcome 2", exact: true }).click();
    await page.locator("#saveCourseButton").click();
    await expect(page.locator("#courseDetail")).not.toContainText("Find supporting details");
    await page.getByRole("button", { name: "Archive course", exact: true }).click();
    await expect(page.locator("#archiveDialog")).toBeVisible();
    await page.locator("#archiveConfirm").click();
    await expect(page.locator("#archiveDialog")).toBeHidden();
    const data = await page.evaluate(() => JSON.parse(localStorage.getItem("beta-db")));
    expect(data.tutor_courses.beta.archived).toBe(false);
    const created = Object.values(data.tutor_courses).find(row => row.title === "New beta course");
    expect(created.archived).toBe(true);
    expect(created.published).toBe(false);
    await page.goto("/toefl-sample/tutor-check.html?studio=1");
    const listing = page.locator("#ownCourses .studio-course").filter({ hasText: "New beta course" });
    await listing.getByRole("button", { name: "Restore as paused", exact: true }).click();
    await expect(listing.locator(".course-state")).toHaveText("Draft");
    await listing.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(listing.locator(".course-state")).toHaveText("Published");
    await listing.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(listing.locator(".course-state")).toHaveText("Draft");
});

test("failed history sync retains the local attempt and retries successfully on reopen", async ({ page }) => {
    await signIn(page);
    await page.goto("/toefl-sample/history.html");
    await page.evaluate(() => localStorage.setItem("beta-deny-write", "true"));
    await page.evaluate(result => window.toeflTestHistory.record(result), practiceResult);
    await page.locator("#practiceTab").click();
    await expect(page.locator(".attempt-card")).toHaveCount(1);
    await expect(page.locator("#historySyncStatus")).toHaveAttribute("data-state", "error");
    await expect(page.locator("#historySyncStatus")).toContainText("locally saved");
    await page.evaluate(() => localStorage.removeItem("beta-deny-write"));
    await page.reload();
    await page.locator("#practiceTab").click();
    await expect(page.locator(".attempt-card")).toHaveCount(1);
    await expect(page.locator("#historySyncStatus")).toHaveAttribute("data-state", "synced");
});

test("signed-out AI is blocked before HTTP; disabled AI shows the server error", async ({ context, page }) => {
    await page.goto("/toefl-sample/signup.html");
    await page.evaluate(result => localStorage.setItem("toefl_section2_result", JSON.stringify(result)), practiceResult);
    let calls = 0;
    await context.route(aiEndpoint, route => {
        calls++;
        return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ detail: "AI is temporarily disabled" }) });
    });
    await page.goto("/toefl-sample/section 2-answered.html");
    await page.getByRole("button", { name: "Open AI QC tutor" }).click();
    await page.locator("#aiqcInput").fill("Help me");
    await page.getByRole("button", { name: "Send question" }).click();
    await expect(page.locator("#aiqcThread")).toContainText("Sign in to your account");
    expect(calls).toBe(0);
    await signIn(page);
    await page.goto("/toefl-sample/section 2-answered.html");
    await page.getByRole("button", { name: "Open AI QC tutor" }).click();
    await page.locator("#aiqcInput").fill("Help me");
    await page.getByRole("button", { name: "Send question" }).click();
    await expect(page.locator("#aiqcThread")).toContainText("AI is temporarily disabled");
    expect(calls).toBe(1);
});
