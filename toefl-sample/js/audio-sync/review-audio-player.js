/*
 * ReviewAudioPlayer
 * Plain JS synced transcript player for existing HTML pages.
 *
 * Usage:
 *   const player = new ReviewAudioPlayer({
 *     audioSelector: '#reviewAudio',
 *     transcriptContainerSelector: '#transcriptList',
 *     data: questionData
 *   });
 *   player.render();
 */

(function bootReviewPlayer(globalScope) {
  "use strict";

  function sec(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "--:--";
    const mins = Math.floor(n / 60);
    const secs = Math.floor(n % 60);
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function flattenQuestions(questionData) {
    const rows = [];
    (questionData || []).forEach((q) => {
      (q.transcripts || []).forEach((segment, idx) => {
        rows.push({
          question_number: q.question_number,
          transcript_index: idx,
          speaker: segment.speaker || "Narrator",
          text: segment.text || "",
          start: typeof segment.start === "number" ? segment.start : null,
          end: typeof segment.end === "number" ? segment.end : null
        });
      });
    });
    return rows;
  }

  class ReviewAudioPlayer {
    constructor(config) {
      if (!config || typeof config !== "object") {
        throw new TypeError("ReviewAudioPlayer requires a config object");
      }

      this.audioEl = document.querySelector(config.audioSelector);
      this.containerEl = document.querySelector(config.transcriptContainerSelector);
      this.questionData = Array.isArray(config.data) ? config.data : [];
      this.rows = flattenQuestions(this.questionData);
      this.activeIndex = -1;
      this.playUntilTime = null;
      this.cardEls = [];
      this.onSegmentChange = typeof config.onSegmentChange === "function" ? config.onSegmentChange : null;

      if (!this.audioEl) {
        throw new Error(`Audio element not found for selector: ${config.audioSelector}`);
      }
      if (!this.containerEl) {
        throw new Error(`Transcript container not found for selector: ${config.transcriptContainerSelector}`);
      }

      this._onTimeUpdate = this._onTimeUpdate.bind(this);
      this._onEnded = this._onEnded.bind(this);
    }

    render() {
      const frag = document.createDocumentFragment();
      this.cardEls = [];

      this.rows.forEach((row, idx) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "review-transcript-card";
        card.dataset.index = String(idx);

        const heading = document.createElement("div");
        heading.className = "review-transcript-heading";
        heading.textContent = `Q${row.question_number} • ${row.speaker}`;

        const body = document.createElement("div");
        body.className = "review-transcript-body";
        body.textContent = row.text;

        const stamp = document.createElement("div");
        stamp.className = "review-transcript-time";
        stamp.textContent = `${sec(row.start)} - ${sec(row.end)}`;

        card.appendChild(heading);
        card.appendChild(body);
        card.appendChild(stamp);

        card.addEventListener("click", () => {
          this.playSegment(idx);
        });

        this.cardEls.push(card);
        frag.appendChild(card);
      });

      this.containerEl.innerHTML = "";
      this.containerEl.appendChild(frag);

      this.audioEl.removeEventListener("timeupdate", this._onTimeUpdate);
      this.audioEl.removeEventListener("ended", this._onEnded);
      this.audioEl.addEventListener("timeupdate", this._onTimeUpdate);
      this.audioEl.addEventListener("ended", this._onEnded);
    }

    playSegment(index) {
      const row = this.rows[index];
      if (!row) return;
      if (row.start == null || row.end == null) return;

      this.activeIndex = index;
      this.playUntilTime = row.end;
      this.audioEl.currentTime = row.start;

      const playPromise = this.audioEl.play();
      if (playPromise && typeof playPromise.catch === "function") {
        playPromise.catch(() => {
          // Mobile browsers may block autoplay until user gesture.
        });
      }

      this._applyActiveCard();
      if (this.onSegmentChange) this.onSegmentChange(row, index);
    }

    _onTimeUpdate() {
      const now = this.audioEl.currentTime;

      if (this.playUntilTime != null && now >= this.playUntilTime) {
        this.audioEl.pause();
        this.playUntilTime = null;
      }

      // Passive highlight when user scrubs manually.
      const currentIdx = this.rows.findIndex((row) => {
        if (row.start == null || row.end == null) return false;
        return now >= row.start && now <= row.end;
      });

      if (currentIdx !== -1 && currentIdx !== this.activeIndex) {
        this.activeIndex = currentIdx;
        this._applyActiveCard();
        if (this.onSegmentChange) this.onSegmentChange(this.rows[currentIdx], currentIdx);
      }
    }

    _onEnded() {
      this.playUntilTime = null;
    }

    _applyActiveCard() {
      this.cardEls.forEach((el, idx) => {
        if (idx === this.activeIndex) {
          el.classList.add("active");
          el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        } else {
          el.classList.remove("active");
        }
      });
    }

    destroy() {
      this.audioEl.removeEventListener("timeupdate", this._onTimeUpdate);
      this.audioEl.removeEventListener("ended", this._onEnded);
      this.cardEls = [];
    }
  }

  globalScope.ReviewAudioPlayer = ReviewAudioPlayer;
})(typeof window !== "undefined" ? window : globalThis);
