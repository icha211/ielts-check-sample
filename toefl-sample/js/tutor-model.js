export const TUTOR_CATEGORIES = [
    ["ielts", "IELTS Preparation", "rosette-discount-check"],
    ["speaking", "Speaking", "messages"], ["listening", "Listening", "headphones"],
    ["reading", "Reading", "book"], ["writing", "Writing", "pencil"],
    ["general", "General English", "school"], ["business", "Business English", "briefcase"],
    ["others", "Others", "category"]
];
export const TUTOR_TYPES = { live: "Live Classes", self: "Self-Paced", package: "Packages" };
export function courseFaq(input, { draft = false } = {}) {
    if (input.faqCustomized !== true) return [
        { question: "How do I join this course?", answer: "Choose Book a Class to send an enrollment request. The teacher will follow up about the schedule." },
        { question: "Do I pay on this page?", answer: "No. This marketplace does not process payments. Confirm payment and class arrangements directly with the teacher." },
        { question: "Where can I see the schedule?", answer: input.schedule || "The teacher has not added schedule details yet." }
    ];
    const source = input.faq ?? {};
    if (typeof source !== "object" || Object.keys(source).length > 20) throw new Error("Add no more than 20 FAQ entries.");
    return Object.entries(source).sort(([a], [b]) => Number(a) - Number(b)).map(([key, item], index) => {
        if (!/^(?:[0-9]|1[0-9])$/.test(key) || !item || typeof item !== "object" ||
            Object.keys(item).some(name => !["question", "answer"].includes(name))) throw new Error("Enter valid FAQ questions and answers.");
        const row = {};
        for (const [name, max] of [["question", 200], ["answer", 2000]]) {
            if (typeof item[name] !== "string") throw new Error(`Enter FAQ ${index + 1} ${name}.`);
            row[name] = item[name].trim();
            if ((!draft && !row[name]) || row[name].length > max) throw new Error(`Enter FAQ ${index + 1} ${name} (${draft ? 0 : 1}-${max} characters).`);
        }
        return row;
    });
}
export function courseAgreement(input, { draft = false } = {}) {
    if (input.agreementEnabled !== true) return null;
    const agreement = {
        version: 1,
        sessionCount: Number(input.sessionCount || 0),
        sessionDurationMinutes: Number(input.sessionDurationMinutes || 0),
        completionDeadline: String(input.completionDeadline || ""),
        cancellationTerms: String(input.cancellationTerms || "").trim()
    };
    for (const [key, max, label] of [["sessionCount", 100, "session count"], ["sessionDurationMinutes", 480, "session duration in minutes"]]) {
        if (!Number.isSafeInteger(agreement[key]) || agreement[key] < (draft ? 0 : 1) || agreement[key] > max) {
            throw new Error(`Enter ${label} from 1 to ${max}.`);
        }
    }
    const date = new Date(`${agreement.completionDeadline}T00:00:00.000Z`);
    if ((!draft || agreement.completionDeadline) && (!/^\d{4}-\d{2}-\d{2}$/.test(agreement.completionDeadline) ||
        Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== agreement.completionDeadline)) {
        throw new Error("Choose a valid course completion deadline.");
    }
    if (input.startDate && agreement.completionDeadline && agreement.completionDeadline < input.startDate) {
        throw new Error("The completion deadline cannot be before the first class date.");
    }
    if ((!draft && !agreement.cancellationTerms) || agreement.cancellationTerms.length > 2000) {
        throw new Error("Enter cancellation and rescheduling terms (1-2,000 characters).");
    }
    return agreement;
}
export function validateCourse(input, { draft = false } = {}) {
    const course = {};
    for (const [key, max] of [["title", 120], ["summary", 500], ["whatYouLearn", 1200], ["curriculum", 5000], ["schedule", 300], ["teacherName", 100]]) {
        course[key] = String(input[key] || "").trim();
        if ((!draft && !course[key]) || course[key].length > max) throw new Error(`Enter ${key} (${draft ? 0 : 1}-${max} characters).`);
    }
    if (!TUTOR_CATEGORIES.some(([id]) => id === input.category) || !Object.hasOwn(TUTOR_TYPES, input.type)) throw new Error("Choose a course category and type.");
    if (![input.price, input.originalPrice].every(value => Number.isSafeInteger(value) && value >= 0 && value <= 100000000) ||
        (input.originalPrice !== 0 && input.originalPrice <= input.price)) throw new Error("Use whole-rupiah prices; the original price must exceed the current price.");
    const coverURL = String(input.coverURL || "").trim();
    if (coverURL.length > 2000) throw new Error("Cover-image URLs must be 2,000 characters or fewer.");
    if (coverURL) {
        let url;
        try { url = new URL(coverURL); } catch { throw new Error("Enter a valid HTTPS cover-image URL."); }
        if (url.protocol !== "https:") throw new Error("Cover images must use HTTPS.");
    }
    const previewURL = String(input.previewURL || "").trim();
    const previewPath = String(input.previewPath || "").trim();
    const previewType = String(input.previewType || "");
    if (previewURL.length > 2000) throw new Error("Course preview URLs must be 2,000 characters or fewer.");
    if (previewURL) {
        let url;
        try { url = new URL(previewURL); } catch { throw new Error("Enter a valid HTTPS course preview URL."); }
        if (url.protocol !== "https:") throw new Error("Course previews must use HTTPS URLs.");
    }
    const validPath = draft ? /^tutor-(courses|drafts)\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/preview\.(png|jpe?g|webp|mp4|webm)$/i : /^tutor-courses\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/preview\.(png|jpe?g|webp|mp4|webm)$/i;
    if (previewPath.length > 500 || (previewPath && !validPath.test(previewPath))) {
        throw new Error("Choose a valid uploaded course preview.");
    }
    if (!["", "image", "video"].includes(previewType) ||
        (previewType === "" && (previewURL || previewPath)) ||
        (previewType !== "" && (!previewPath || (!previewURL && !(draft && previewPath.startsWith("tutor-drafts/")))))) throw new Error("Upload an image or video preview for this course.");
    const scheduleDays = String(input.scheduleDays || "").trim();
    const startTime = String(input.startTime || "");
    const endTime = String(input.endTime || "");
    const startDate = String(input.startDate || "");
    const mode = String(input.mode || "");
    const maxStudents = input.maxStudents === "" || input.maxStudents == null ? 0 : Number(input.maxStudents);
    if (scheduleDays.length > 100) throw new Error("Class days must be 100 characters or fewer.");
    if (![startTime, endTime].every(value => !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(value)) ||
        (startTime && endTime && endTime <= startTime)) throw new Error("Enter a valid class start and end time.");
    if (startDate) {
        const parsedDate = new Date(`${startDate}T00:00:00.000Z`);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== startDate) {
            throw new Error("Choose a valid class start date.");
        }
    }
    if (mode && !["online", "offline"].includes(mode)) throw new Error("Choose online or in-person classes.");
    if (!Number.isSafeInteger(maxStudents) || maxStudents < 0 || maxStudents > 500) throw new Error("Set course capacity from 1 to 500, or leave it blank for no limit.");
    const agreement = courseAgreement(input, { draft });
    if (input.faqCustomized != null && typeof input.faqCustomized !== "boolean") throw new Error("Choose a valid FAQ configuration.");
    if (input.faq != null && input.faqCustomized !== true) throw new Error("Enable custom FAQs before saving FAQ entries.");
    const faq = courseFaq(input, { draft });
    return {
        ...course, category: input.category, type: input.type, price: input.price, originalPrice: input.originalPrice,
        coverURL, previewURL, previewPath, previewType, scheduleDays, startTime, endTime, startDate, mode, maxStudents,
        agreementEnabled: agreement !== null,
        sessionCount: agreement?.sessionCount || 0, sessionDurationMinutes: agreement?.sessionDurationMinutes || 0,
        completionDeadline: agreement?.completionDeadline || "", cancellationTerms: agreement?.cancellationTerms || "",
        faqCustomized: input.faqCustomized === true,
        faq: input.faqCustomized === true && faq.length ? Object.fromEntries(faq.map((item, index) => [index, item])) : null,
        published: !draft && input.published === true
    };
}
export function courseStats(reviews = {}, requests = {}) {
    const ratings = Object.values(reviews).filter(row => Number.isInteger(row.rating) && row.rating >= 1 && row.rating <= 5);
    return { count: ratings.length, rating: ratings.length ? ratings.reduce((sum, row) => sum + row.rating, 0) / ratings.length : null,
        students: Object.values(requests).filter(row => row.status === "accepted").length };
}
export function selectCourses(courses, filters = {}, stats = {}) {
    const search = String(filters.search || "").trim().toLocaleLowerCase();
    return Object.entries(courses).map(([id, course]) => ({ ...course, id })).filter(course => course.published && !course.archived &&
        (!filters.teacher || course.teacherId === filters.teacher) &&
        (!filters.category || course.category === filters.category) && (!filters.type || course.type === filters.type) &&
        (!search || `${course.title} ${course.teacherName} ${course.summary}`.toLocaleLowerCase().includes(search)) &&
        (!filters.prices?.length || filters.prices.some(range => {
            const [min, max] = range.split(":").map(Number);
            return course.price >= min && course.price < max;
        })) && (!filters.rating || (stats[course.id]?.rating || 0) >= Number(filters.rating)))
        .sort((a, b) => filters.sort === "price-low" ? a.price - b.price : filters.sort === "price-high" ? b.price - a.price :
            filters.sort === "rating" ? (stats[b.id]?.rating || 0) - (stats[a.id]?.rating || 0) : b.createdAt - a.createdAt);
}
export const rupiah = value => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(value);
export function validateTeachingProfile(input) {
    const result = { experience: input.experience };
    if (!Number.isInteger(result.experience) || result.experience < 0 || result.experience > 80) throw new Error("Enter teaching experience as whole years, from 0 to 80.");
    for (const [key, max] of [["qualification", 120], ["about", 3000], ["imageURL", 2000]]) {
        result[key] = String(input[key] || "").trim();
        if (result[key].length > max) throw new Error(`${key} must be ${max} characters or fewer.`);
    }
    if (result.imageURL) {
        let url;
        try { url = new URL(result.imageURL); } catch { throw new Error("Enter a valid HTTPS image URL."); }
        if (url.protocol !== "https:") throw new Error("Images must use HTTPS.");
    }
    return result;
}
export function teachingSummary(courses, reviews, uid) {
    const owned = Object.entries(courses).filter(([, course]) => course.teacherId === uid);
    const published = owned.filter(([, course]) => course.published && !course.archived).map(([id, course]) => ({ ...course, id })).sort((a, b) => b.createdAt - a.createdAt);
    const rows = owned.flatMap(([courseId, course]) => Object.entries(reviews[courseId] || {}).filter(([, review]) => Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5)
        .map(([studentId, review]) => ({ ...review, studentId, courseId, courseTitle: course.title }))).sort((a, b) => b.updatedAt - a.updatedAt);
    return { courses: published, reviews: rows, reviewers: new Set(rows.map(row => row.studentId)).size,
        rating: rows.length ? rows.reduce((sum, row) => sum + row.rating, 0) / rows.length : null };
}
