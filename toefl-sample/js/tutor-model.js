export const TUTOR_CATEGORIES = [
    ["ielts", "IELTS Preparation", "rosette-discount-check"],
    ["speaking", "Speaking", "messages"], ["listening", "Listening", "headphones"],
    ["reading", "Reading", "book"], ["writing", "Writing", "pencil"],
    ["general", "General English", "school"], ["business", "Business English", "briefcase"],
    ["others", "Others", "category"]
];
export const TUTOR_TYPES = { live: "Live Classes", self: "Self-Paced", package: "Packages" };
export function validateCourse(input) {
    const course = {};
    for (const [key, max] of [["title", 120], ["summary", 500], ["curriculum", 5000], ["schedule", 300], ["teacherName", 100]]) {
        course[key] = String(input[key] || "").trim();
        if (!course[key] || course[key].length > max) throw new Error(`Enter ${key} (1-${max} characters).`);
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
    return { ...course, category: input.category, type: input.type, price: input.price, originalPrice: input.originalPrice, coverURL, published: input.published === true };
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
