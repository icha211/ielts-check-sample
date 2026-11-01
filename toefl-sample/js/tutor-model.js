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
    return Object.entries(courses).map(([id, course]) => ({ ...course, id })).filter(course => course.published &&
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
