const DEFAULT_MAX_DIMENSION = 2048;
const MIN_DIMENSION = 256;
const QUALITY_STEPS = [0.9, 0.82, 0.74, 0.66, 0.58];
const SCALE_STEP = 0.8;

async function decodeImage(file) {
    if (typeof createImageBitmap === "function") {
        try {
            return await createImageBitmap(file, { imageOrientation: "from-image" });
        } catch (_) { /* fall back to <img> decoding below */ }
    }
    const url = URL.createObjectURL(file);
    try {
        const img = new Image();
        img.decoding = "async";
        img.src = url;
        await img.decode();
        return img;
    } finally {
        URL.revokeObjectURL(url);
    }
}

function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Returns the original file when it already fits, otherwise a JPEG re-encoded
 * (and downscaled if needed) so that its size is at most `maxBytes`.
 */
export async function compressImageToLimit(file, maxBytes, { maxDimension = DEFAULT_MAX_DIMENSION } = {}) {
    if (file.size <= maxBytes) return { blob: file, type: file.type, compressed: false };

    const source = await decodeImage(file);
    const sourceWidth = source.width || source.naturalWidth;
    const sourceHeight = source.height || source.naturalHeight;
    if (!sourceWidth || !sourceHeight) throw new Error("image-decode-failed");

    let scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");

    try {
        while (Math.max(sourceWidth, sourceHeight) * scale >= MIN_DIMENSION) {
            canvas.width = Math.max(1, Math.round(sourceWidth * scale));
            canvas.height = Math.max(1, Math.round(sourceHeight * scale));
            // JPEG has no alpha channel, so paint transparent areas white instead of black.
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

            for (const quality of QUALITY_STEPS) {
                const blob = await canvasToBlob(canvas, "image/jpeg", quality);
                if (blob && blob.size <= maxBytes) {
                    return { blob, type: "image/jpeg", compressed: true, width: canvas.width, height: canvas.height };
                }
            }
            scale *= SCALE_STEP;
        }
    } finally {
        source.close?.();
        canvas.width = 0;
        canvas.height = 0;
    }
    throw new Error("image-too-large");
}
