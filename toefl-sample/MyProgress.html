import React, { useState, useMemo } from "react";
import {
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, Legend
} from "recharts";
import {
  Headphones, PenLine, BookOpen, Target, Calendar, TrendingUp,
  TrendingDown, Sparkles, ChevronRight, ChevronLeft, Clock, CheckCircle2,
  Circle, ListChecks, History as HistoryIcon, FileText, Dumbbell
} from "lucide-react";
 
// ---------- Design tokens ----------
const tokens = {
  ink: "#14213D",
  paper: "#F5F6F8",
  card: "#FFFFFF",
  line: "#E4E7EC",
  muted: "#6B7280",
  ai: "#6D5DFC",
  aiSoft: "#EFECFF",
  listening: "#2A9D8F",
  listeningSoft: "#E3F4F1",
  structure: "#E76F51",
  structureSoft: "#FCEAE4",
  writing: "#F4A261",
  writingSoft: "#FDF1E4",
  reading: "#457B9D",
  readingSoft: "#E7EFF4",
  good: "#2A9D8F",
  warn: "#E9A23B",
  bad: "#D64545",
};
 
// ---------- Mock data (swap for Firestore data) ----------
const profile = {
  currentScore: 517,
  projectedScore: 543,
  goalScore: 550,
  scoreRange: [310, 677],
  examDate: "2026-11-15",
};
 
// Official 3 composite sections (what the mock test + radar + accuracy list use)
const skills = [
  { key: "listening", label: "Listening", icon: Headphones, color: tokens.listening, soft: tokens.listeningSoft, current: 49, goal: 55, max: 68, accuracy: 74, deltaWeek: +4 },
  { key: "structure", label: "Structure & Writing", icon: PenLine, color: tokens.structure, soft: tokens.structureSoft, current: 42, goal: 52, max: 68, accuracy: 58, deltaWeek: +2 },
  { key: "reading", label: "Reading", icon: BookOpen, color: tokens.reading, soft: tokens.readingSoft, current: 51, goal: 55, max: 68, accuracy: 81, deltaWeek: -1 },
];
 
// Granular 4 skills used ONLY for practice sessions (AI targets these independently)
const practiceSkillMeta = {
  listening: { label: "Listening", icon: Headphones, color: tokens.listening, soft: tokens.listeningSoft },
  structure: { label: "Structure", icon: PenLine, color: tokens.structure, soft: tokens.structureSoft },
  writing: { label: "Writing", icon: PenLine, color: tokens.writing, soft: tokens.writingSoft },
  reading: { label: "Reading", icon: BookOpen, color: tokens.reading, soft: tokens.readingSoft },
};
 
const radarData = skills.map(s => ({ skill: s.label, current: s.current, goal: s.goal, fullMark: s.max }));
 
// Recent mock tests, most recent last
const mockHistory = [
  { date: "Oct 1, 2026", label: "Mock #1", composite: 493, sections: { listening: 45, structure: 38, reading: 49 } },
  { date: "Oct 8, 2026", label: "Mock #2", composite: 505, sections: { listening: 47, structure: 40, reading: 50 } },
  { date: "Oct 15, 2026", label: "Mock #3", composite: 517, sections: { listening: 49, structure: 42, reading: 51 } },
];
 
// Recent practice sessions, most recent last — each targets a subset of the 4 granular skills
const practiceHistory = [
  { date: "Oct 2, 2026", minutes: 35, scores: { listening: 78, structure: 62 } },
  { date: "Oct 3, 2026", minutes: 40, scores: { structure: 65, writing: 55 } },
  { date: "Oct 4, 2026", minutes: 30, scores: { reading: 80, listening: 81 } },
];
 
// Unified timeline for the History section (drives graph + full list)
const historyTimeline = [
  { date: "Oct 1", label: "Mock #1", type: "mock", composite: 493, listening: 45, structure: 38, reading: 49 },
  { date: "Oct 2", label: "Practice", type: "practice", composite: null, listening: 47, structure: 39, reading: null },
  { date: "Oct 3", label: "Practice", type: "practice", composite: null, listening: null, structure: 41, reading: 50 },
  { date: "Oct 4", label: "Practice", type: "practice", composite: null, listening: 48, structure: 40, reading: null },
  { date: "Oct 8", label: "Mock #2", type: "mock", composite: 505, listening: 47, structure: 40, reading: 50 },
  { date: "Oct 15", label: "Mock #3", type: "mock", composite: 517, listening: 49, structure: 42, reading: 51 },
];
 
const aiPlan = [
  { id: 1, skill: "structure", title: "Subject–verb agreement drills", reason: "Your Structure score (42) is the widest gap from goal (52) — 24% of missed items were agreement errors.", minutes: 25, status: "pending" },
  { id: 2, skill: "listening", title: "Lecture note-taking: signal words", reason: "You lose points converting spoken detail into notes, not in raw comprehension — targeted drill on transitions.", minutes: 20, status: "pending" },
  { id: 3, skill: "reading", title: "Timed passage review (light touch)", reason: "Reading is closest to goal. Light maintenance only, so most of today's time goes to Structure.", minutes: 15, status: "completed" },
];
 
function daysUntil(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return Math.max(0, Math.ceil((d - new Date()) / 86400000));
}
 
// ---------- Small building blocks ----------
function SectionLabel({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      {Icon && <Icon size={16} style={{ color: tokens.muted }} />}
      <h2 className="text-sm font-semibold tracking-wide uppercase" style={{ color: tokens.muted, letterSpacing: "0.06em" }}>
        {children}
      </h2>
    </div>
  );
}
 
function Card({ children, className = "", id }) {
  return (
    <div id={id} className={`rounded-2xl p-6 ${className}`} style={{ background: tokens.card, border: `1px solid ${tokens.line}` }}>
      {children}
    </div>
  );
}
 
function CarouselArrows({ index, total, onPrev, onNext }) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onPrev}
        disabled={index === 0}
        className="w-6 h-6 rounded-full flex items-center justify-center disabled:opacity-30"
        style={{ background: tokens.paper }}
        aria-label="Previous"
      >
        <ChevronLeft size={13} style={{ color: tokens.ink }} />
      </button>
      <div className="flex items-center gap-1">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className="rounded-full"
            style={{ width: 5, height: 5, background: i === index ? tokens.ai : tokens.line }}
          />
        ))}
      </div>
      <button
        onClick={onNext}
        disabled={index === total - 1}
        className="w-6 h-6 rounded-full flex items-center justify-center disabled:opacity-30"
        style={{ background: tokens.paper }}
        aria-label="Next"
      >
        <ChevronRight size={13} style={{ color: tokens.ink }} />
      </button>
    </div>
  );
}
 
// ---------- Main page ----------
export default function MyProgress() {
  const [historyView, setHistoryView] = useState("composite");
  const [resultsTab, setResultsTab] = useState("mock"); // mock | practice
  const [mockIdx, setMockIdx] = useState(mockHistory.length - 1);
  const [practiceIdx, setPracticeIdx] = useState(practiceHistory.length - 1);
 
  const days = daysUntil(profile.examDate);
  const progressPct = Math.min(100, Math.round(((profile.currentScore - profile.scoreRange[0]) / (profile.goalScore - profile.scoreRange[0])) * 100));
  const gapToGoal = profile.goalScore - profile.currentScore;
 
  const activeMock = mockHistory[mockIdx];
  const activePractice = practiceHistory[practiceIdx];
  const isLatestMock = mockIdx === mockHistory.length - 1;
  const isLatestPractice = practiceIdx === practiceHistory.length - 1;
 
  const scrollToHistory = () => {
    document.getElementById("history-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
 
  return (
    <div className="min-h-screen w-full" style={{ background: tokens.paper, fontFamily: "'Inter', sans-serif" }}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
 
        {/* HERO — Overall Progress */}
        <Card className="!p-0 overflow-hidden">
          <div className="p-6 sm:p-8" style={{ background: `linear-gradient(135deg, ${tokens.ink} 0%, #1F2E52 100%)` }}>
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Target size={16} color="#B9C2E0" />
                  <span className="text-xs font-medium tracking-wide uppercase" style={{ color: "#B9C2E0", letterSpacing: "0.06em" }}>Overall Progress</span>
                </div>
                <div className="flex items-baseline gap-3 flex-wrap">
                  <span className="text-5xl font-bold tabular-nums text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{profile.currentScore}</span>
                  <span className="text-sm" style={{ color: "#B9C2E0" }}>current composite</span>
                </div>
                <div className="mt-1 text-sm" style={{ color: "#B9C2E0" }}>
                  Goal <strong className="text-white font-semibold">{profile.goalScore}</strong> · {gapToGoal} points to go
                </div>
              </div>
              <div className="flex gap-8">
                <div>
                  <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: "#CFC8FF" }}>
                    <Sparkles size={13} /><span className="uppercase tracking-wide font-medium" style={{ letterSpacing: "0.05em" }}>AI projected</span>
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{profile.projectedScore}</div>
                  <div className="text-xs mt-0.5" style={{ color: "#B9C2E0" }}>by exam day, at current pace</div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-xs mb-1" style={{ color: "#B9C2E0" }}>
                    <Calendar size={13} /><span className="uppercase tracking-wide font-medium" style={{ letterSpacing: "0.05em" }}>Exam day</span>
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-white" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{days}d</div>
                  <div className="text-xs mt-0.5" style={{ color: "#B9C2E0" }}>Nov 15, 2026</div>
                </div>
              </div>
            </div>
            <div className="mt-6">
              <div className="h-2 rounded-full w-full overflow-hidden" style={{ background: "rgba(255,255,255,0.15)" }}>
                <div className="h-full rounded-full" style={{ width: `${progressPct}%`, background: `linear-gradient(90deg, ${tokens.ai}, #A79BFF)` }} />
              </div>
              <div className="flex justify-between mt-1.5 text-[11px]" style={{ color: "#8E9AC2" }}>
                <span>{profile.scoreRange[0]}</span>
                <span>{profile.currentScore} pts · {progressPct}% of the way to goal</span>
                <span>{profile.goalScore}</span>
              </div>
            </div>
          </div>
        </Card>
 
        {/* ROW: Radar + Recent Results (tabs: Mock / Practice, each with carousel) */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Radar */}
          <Card className="lg:col-span-3">
            <SectionLabel icon={Target}>Skill Standing vs. Goal</SectionLabel>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="72%">
                  <PolarGrid stroke={tokens.line} />
                  <PolarAngleAxis dataKey="skill" tick={{ fill: tokens.ink, fontSize: 12, fontWeight: 500 }} />
                  <PolarRadiusAxis angle={30} domain={[30, 68]} tick={{ fill: tokens.muted, fontSize: 10 }} tickCount={4} />
                  <Radar name="Goal" dataKey="goal" stroke={tokens.muted} strokeDasharray="4 4" fill={tokens.muted} fillOpacity={0.05} />
                  <Radar name="Current" dataKey="current" stroke={tokens.ai} fill={tokens.ai} fillOpacity={0.28} strokeWidth={2} />
                  <Legend verticalAlign="bottom" height={28} iconType="plainline" wrapperStyle={{ fontSize: 12, color: tokens.muted }} />
                  <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${tokens.line}`, fontSize: 12 }} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-xs mt-2" style={{ color: tokens.muted }}>
              "Current" is your last mock test's section scores — see how it's built in the card on the right.
            </p>
          </Card>
 
          {/* Recent Results — unified card, tabs + carousel, links out to full history */}
          <Card className="lg:col-span-2 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: tokens.line }}>
                {[
                  { key: "mock", label: "Mock Test", icon: FileText },
                  { key: "practice", label: "Practice", icon: Dumbbell },
                ].map(t => (
                  <button
                    key={t.key}
                    onClick={() => setResultsTab(t.key)}
                    className="px-3 py-1.5 text-xs font-medium flex items-center gap-1.5"
                    style={{ background: resultsTab === t.key ? tokens.ink : "transparent", color: resultsTab === t.key ? "#fff" : tokens.muted }}
                  >
                    <t.icon size={12} /> {t.label}
                  </button>
                ))}
              </div>
              {resultsTab === "mock" ? (
                <CarouselArrows index={mockIdx} total={mockHistory.length} onPrev={() => setMockIdx(i => Math.max(0, i - 1))} onNext={() => setMockIdx(i => Math.min(mockHistory.length - 1, i + 1))} />
              ) : (
                <CarouselArrows index={practiceIdx} total={practiceHistory.length} onPrev={() => setPracticeIdx(i => Math.max(0, i - 1))} onNext={() => setPracticeIdx(i => Math.min(practiceHistory.length - 1, i + 1))} />
              )}
            </div>
 
            {resultsTab === "mock" ? (
              <>
                <div className="text-xs mb-3 flex items-center gap-1.5" style={{ color: tokens.muted }}>
                  {activeMock.date} · {activeMock.label}
                  {isLatestMock && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: tokens.aiSoft, color: tokens.ai }}>Latest</span>}
                </div>
                <div className="text-4xl font-bold tabular-nums mb-4" style={{ color: tokens.ink, fontFamily: "'Space Grotesk', sans-serif" }}>
                  {activeMock.composite}
                </div>
                <div className="space-y-3 flex-1">
                  {skills.map(s => {
                    const Icon = s.icon;
                    const val = activeMock.sections[s.key];
                    const pct = Math.round((val / s.max) * 100);
                    return (
                      <div key={s.key}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="flex items-center gap-1.5 font-medium" style={{ color: tokens.ink }}><Icon size={13} style={{ color: s.color }} /> {s.label}</span>
                          <span className="tabular-nums font-semibold" style={{ color: s.color }}>{val}</span>
                        </div>
                        <div className="h-1.5 rounded-full w-full" style={{ background: s.soft }}>
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: s.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <>
                <div className="text-xs mb-3 flex items-center gap-1.5" style={{ color: tokens.muted }}>
                  {activePractice.date} · {activePractice.minutes} min session
                  {isLatestPractice && <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: tokens.aiSoft, color: tokens.ai }}>Latest</span>}
                </div>
                <div className="text-xs mb-4" style={{ color: tokens.muted }}>Practice targets specific skills, not a full section — only what was drilled shows a score.</div>
                <div className="space-y-3 flex-1">
                  {Object.entries(practiceSkillMeta).map(([key, meta]) => {
                    const Icon = meta.icon;
                    const val = activePractice.scores[key];
                    const practiced = val !== undefined;
                    return (
                      <div key={key} style={{ opacity: practiced ? 1 : 0.4 }}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="flex items-center gap-1.5 font-medium" style={{ color: tokens.ink }}><Icon size={13} style={{ color: meta.color }} /> {meta.label}</span>
                          <span className="tabular-nums font-semibold" style={{ color: practiced ? meta.color : tokens.muted }}>{practiced ? `${val}%` : "not drilled"}</span>
                        </div>
                        <div className="h-1.5 rounded-full w-full" style={{ background: meta.soft }}>
                          {practiced && <div className="h-full rounded-full" style={{ width: `${val}%`, background: meta.color }} />}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
 
            <button onClick={scrollToHistory} className="mt-4 text-xs font-medium flex items-center gap-1 self-start" style={{ color: tokens.ai }}>
              View full history <ChevronRight size={13} />
            </button>
          </Card>
        </div>
 
        {/* AI Recommended Plan */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles size={16} style={{ color: tokens.ai }} />
              <h2 className="text-sm font-semibold tracking-wide uppercase" style={{ color: tokens.ai, letterSpacing: "0.06em" }}>AI Study Plan · Today</h2>
            </div>
            <button className="text-xs font-medium flex items-center gap-1" style={{ color: tokens.muted }}>View full 4-week roadmap <ChevronRight size={13} /></button>
          </div>
          <div className="space-y-2">
            {aiPlan.map(task => {
              const skill = skills.find(s => s.key === task.skill);
              const Icon = skill.icon;
              const done = task.status === "completed";
              return (
                <div key={task.id} className="flex items-start gap-3 p-3 rounded-xl" style={{ background: done ? tokens.paper : skill.soft, opacity: done ? 0.65 : 1 }}>
                  <div className="mt-0.5">{done ? <CheckCircle2 size={18} style={{ color: tokens.good }} /> : <Circle size={18} style={{ color: skill.color }} />}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Icon size={14} style={{ color: skill.color }} />
                      <span className={`text-sm font-semibold ${done ? "line-through" : ""}`} style={{ color: tokens.ink }}>{task.title}</span>
                      <span className="text-[11px] flex items-center gap-1" style={{ color: tokens.muted }}><Clock size={11} /> {task.minutes} min</span>
                    </div>
                    <p className="text-xs mt-1" style={{ color: tokens.muted }}>{task.reason}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
 
        {/* Mock Test & Practice History — the ONE canonical full-history view */}
        <Card id="history-section">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <SectionLabel icon={TrendingUp}><span className="normal-case tracking-normal text-sm font-semibold" style={{ color: tokens.ink }}>Score Trajectory</span></SectionLabel>
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: tokens.line }}>
              {["composite", "bySkill"].map(v => (
                <button key={v} onClick={() => setHistoryView(v)} className="px-3 py-1.5 text-xs font-medium" style={{ background: historyView === v ? tokens.ink : "transparent", color: historyView === v ? "#fff" : tokens.muted }}>
                  {v === "composite" ? "Composite" : "By Section"}
                </button>
              ))}
            </div>
          </div>
 
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={historyTimeline} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={tokens.line} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: tokens.muted }} axisLine={{ stroke: tokens.line }} tickLine={false} />
                <YAxis domain={historyView === "composite" ? [470, 560] : [30, 60]} tick={{ fontSize: 11, fill: tokens.muted }} axisLine={false} tickLine={false} width={34} />
                <Tooltip contentStyle={{ borderRadius: 10, border: `1px solid ${tokens.line}`, fontSize: 12 }} />
                {historyView === "composite" ? (
                  <>
                    <ReferenceLine y={profile.goalScore} stroke={tokens.warn} strokeDasharray="4 4" label={{ value: "Goal", fontSize: 10, fill: tokens.warn, position: "right" }} />
                    <Line type="monotone" dataKey="composite" name="Mock composite" stroke={tokens.ai} strokeWidth={2.5} dot={{ r: 4, fill: tokens.ai }} connectNulls />
                  </>
                ) : (
                  <>
                    <Line type="monotone" dataKey="listening" name="Listening" stroke={tokens.listening} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="structure" name="Structure & Writing" stroke={tokens.structure} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="reading" name="Reading" stroke={tokens.reading} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                    <Legend verticalAlign="top" height={24} iconType="plainline" wrapperStyle={{ fontSize: 11, color: tokens.muted }} />
                  </>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
 
          <div className="mt-5 divide-y" style={{ borderColor: tokens.line }}>
            {[...historyTimeline].reverse().map((h, i) => (
              <div key={i} className="flex items-center justify-between py-2.5" style={{ borderTop: i === 0 ? "none" : `1px solid ${tokens.line}` }}>
                <div className="flex items-center gap-3">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide" style={{ background: h.type === "mock" ? tokens.aiSoft : tokens.paper, color: h.type === "mock" ? tokens.ai : tokens.muted }}>{h.type}</span>
                  <span className="text-sm font-medium" style={{ color: tokens.ink }}>{h.label}</span>
                  <span className="text-xs" style={{ color: tokens.muted }}>{h.date}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums" style={{ color: tokens.ink }}>{h.composite ? h.composite : "—"}</span>
              </div>
            ))}
          </div>
        </Card>
 
        {/* Skill Accuracy by Module */}
        <Card>
          <SectionLabel icon={ListChecks}>Skill Accuracy by Module</SectionLabel>
          <div className="space-y-4">
            {skills.map(s => {
              const Icon = s.icon;
              const up = s.deltaWeek >= 0;
              return (
                <div key={s.key} className="flex items-center gap-4">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0" style={{ background: s.soft }}>
                    <Icon size={16} style={{ color: s.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-sm font-semibold" style={{ color: tokens.ink }}>{s.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold tabular-nums" style={{ color: tokens.ink }}>{s.accuracy}%</span>
                        <span className="flex items-center gap-0.5 text-xs font-medium" style={{ color: up ? tokens.good : tokens.bad }}>
                          {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}{Math.abs(s.deltaWeek)}%
                        </span>
                      </div>
                    </div>
                    <div className="h-2 rounded-full w-full" style={{ background: s.soft }}>
                      <div className="h-full rounded-full" style={{ width: `${s.accuracy}%`, background: s.color }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
 
      </div>
    </div>
  );
}
 
