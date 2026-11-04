"""Build the frontend-only artifact shared by Firebase Hosting and Pages."""

import shutil
from pathlib import Path


PUBLIC_DIRECTORIES = {"asset", "asst", "toefl-sample"}
PUBLIC_EXTENSIONS = {
    ".html", ".js", ".css", ".png", ".jpg", ".jpeg", ".svg", ".webp",
    ".gif", ".ico", ".mp3", ".wav", ".m4a", ".aac", ".ogg", ".flac",
    ".mp4", ".webm", ".woff", ".woff2", ".ttf", ".otf",
}


def is_public_asset(path: Path) -> bool:
    if any(part.startswith(".") or part in {"node_modules", "__pycache__"} for part in path.parts):
        return False
    if len(path.parts) > 1 and path.parts[0] not in PUBLIC_DIRECTORIES:
        return False
    if path.suffix.lower() == ".js" and (
        path.name.endswith(".test.js") or path.name.startswith(("test_", "test-"))
    ):
        return False
    return path.suffix.lower() in PUBLIC_EXTENSIONS


def stage_public_site(root: Path) -> Path:
    destination = root / ".public-site"
    if destination.is_symlink():
        raise ValueError("Public output directory must not be a symbolic link")
    if destination.exists():
        shutil.rmtree(destination)
    destination.mkdir()

    candidates = list(root.iterdir())
    for directory in PUBLIC_DIRECTORIES:
        source = root / directory
        if source.is_symlink():
            raise ValueError(f"Public source directory must not be a symbolic link: {directory}")
        if source.is_dir():
            candidates.extend(source.rglob("*"))
    count = 0
    for source in candidates:
        relative = source.relative_to(root)
        if not is_public_asset(relative):
            continue
        if source.is_symlink() or any(parent.is_symlink() for parent in source.parents if parent != root):
            raise ValueError(f"Public asset must not be a symbolic link: {relative}")
        if not source.is_file():
            continue
        target = destination / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source, target)
        count += 1
    if not (destination / "index.html").is_file():
        raise ValueError("Public artifact is missing index.html")
    print(f"Staged {count} frontend assets in {destination.name}")
    return destination


if __name__ == "__main__":
    stage_public_site(Path(__file__).resolve().parents[1])
