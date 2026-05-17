# TOEFL ITP Dataset Schemas

This file defines practical schemas for data collection and model training for:
- answer explanation quality
- weakness diagnosis
- personalized study recommendations

Use UTF-8 CSV files with stable IDs and ISO 8601 timestamps.

## 1) Item Bank (question metadata + explanations)

Recommended file: item_bank.csv

Required columns:
- item_id
- section
- part
- question_text
- option_a
- option_b
- option_c
- option_d
- correct_option
- explanation_short
- explanation_long
- difficulty_bloom
- difficulty_empirical
- subskill_primary
- subskill_secondary
- distractor_a_reason
- distractor_b_reason
- distractor_c_reason
- distractor_d_reason
- source_type
- source_ref
- created_at
- updated_at

Optional but recommended columns:
- transcript_text (required for listening items when generating AI explanations)
- passage_id (for reading items with passages)
- passage_line_range (e.g., "1-9", "10-18")
- passage_excerpt (key lines from passage relevant to question)
- line_explanation (structural guide for how to analyze the passage lines)

Notes:
- section values: listening, structure, reading
- part values can be your own mapping (example: listening_part_a, structure_error_id, reading_comprehension)
- correct_option values: A, B, C, D
- source_type values: authored, licensed, public_domain
- transcript_text: Full transcription of audio content; critical for listening items when using AI to generate or validate explanations. Ensures explanation accuracy and proper distractor reasoning. Leave empty for reading/structure sections.
- passage_id: Reference to passages.csv; use for reading items that reference longer passages
- passage_line_range: Lines from passage relevant to the question (e.g., "1-9", "10-18"). Helps AI focus on correct section
- passage_excerpt: Quoted excerpt from passage with line numbers showing key evidence. Prevents AI hallucination of quotes
- line_explanation: Structural breakdown of how passage lines relate to the question. Guides AI model on analytical approach. Example: "Lines 1-9 establish context; Lines 10-18 describe the process; Lines 19-28 explain the outcome."

Example row (reading with passage reference):

item_id,section,part,passage_id,passage_line_range,passage_excerpt,line_explanation,question_text,option_a,option_b,option_c,option_d,correct_option,explanation_short,explanation_long,difficulty_bloom,difficulty_empirical,subskill_primary,subskill_secondary,distractor_a_reason,distractor_b_reason,distractor_c_reason,distractor_d_reason,source_type,source_ref,created_at,updated_at
ITP_R_000123,reading,reading_comprehension,PSG_R_001,"1-9","(1) Before the late nineteenth century, aluminum was considered a precious metal... (5) pure aluminum was a rarity, often used for high-end jewelry and elite architectural details.","Lines 1-9 establish aluminum's historical rarity due to difficult extraction.","What was aluminum's status before the 1880s?","precious metal","industrial material","common commodity","modern invention",A,"Aluminum was a rare precious metal before 1886.","Lines 1-9 establish that aluminum was considered precious because it was bound tightly to oxygen and extremely difficult to separate using available methods. It was used only for jewelry and elite architecture, proving its rarity before the technological breakthrough.",understand,0.68,detail,inference,"Confuses post-1886 status with pre-1886","Jumps to modern use without reading carefully","Misses 'before 1880s' qualifier","Focuses on extraction difficulty rather than status",authored,internal_set_v3,2026-05-06T00:00:00Z,2026-05-06T00:00:00Z

Example row (listening with transcript):

item_id,section,part,question_text,option_a,option_b,option_c,option_d,correct_option,explanation_short,explanation_long,difficulty_bloom,difficulty_empirical,subskill_primary,subskill_secondary,distractor_a_reason,distractor_b_reason,distractor_c_reason,distractor_d_reason,source_type,source_ref,transcript_text,created_at,updated_at
ITP_L_000045,listening,listening_part_a,"What is the main purpose of the lecture?","To explain a scientific theory","To describe a historical event","To discuss teaching methods","To critique a research study",B,"The speaker focuses on implementing effective teaching strategies.","The speaker spends most time explaining implementation techniques and their impact on student learning; other options are mentioned only briefly.",understand,0.71,gist,inference,"Confuses supporting details with main purpose","Close but narrower than stated focus","Opposite of actual purpose","Treats conclusion as main point",authored,internal_set_v2,"The effectiveness of classroom teaching depends on understanding how students learn. Recent research shows that active engagement techniques significantly improve retention. Today, I'll focus on practical strategies for implementing these methods in your classroom—from discussion structures to collaborative problem-solving.",2026-05-06T00:00:00Z,2026-05-06T00:00:00Z

## 1.5) Passages (for reading comprehension items)

Recommended file: passages.csv

Required columns:
- passage_id
- section
- passage_text
- source_type
- source_ref
- created_at
- updated_at

Notes:
- passage_id: Unique identifier (format: PSG_R_001, PSG_R_002, etc.)
- section: Always "reading" for this table
- passage_text: Full passage with line numbers marked at logical breaks (e.g., "(1) First paragraph... (10) Second paragraph... (19) Third paragraph...")
- source_type values: authored, licensed, public_domain
- One passage can support multiple questions via passage_id reference in item_bank.csv
- Keep line number markers consistent (typically every 9-10 lines or at paragraph breaks)

Example row:

passage_id,section,passage_text,source_type,source_ref,created_at,updated_at
PSG_R_001,reading,"(1) Before the late nineteenth century, aluminum was considered a precious metal, valued more highly than gold or silver. Although it is the most abundant metal in the Earth's crust, it is never found in its pure form in nature. Instead, it is typically bound tightly to oxygen in a mineral known as bauxite. The chemical bond between aluminum and oxygen is exceptionally strong, making it incredibly difficult and expensive to separate the pure metal using the metallurgical methods available prior to the 1880s. As a result, pure aluminum was a rarity, often used for high-end jewelry and elite architectural details rather than everyday applications.
(10) This situation changed dramatically in 1886 due to a remarkable historical coincidence. Two young scientists, Charles Martin Hall in the United States and Paul Héroult in France, working completely independently of one another, simultaneously discovered a practical method for extracting aluminum. They found that dissolving aluminum oxide in molten cryolite—a rare mineral compound—significantly lowered the melting point of the mixture. This allowed them to pass an electric current through the liquid, which separated the pure aluminum from the oxygen. This method, now known as the Hall-Héroult process, revolutionized the industry.
(19) The introduction of the Hall-Héroult process, coupled with the advent of large-scale electricity generation, led to a rapid and massive decline in the price of aluminum. What was once a luxury reserved for the wealthy quickly became an accessible commodity. The metal's unique properties—particularly its lightweight nature, resistance to corrosion, and excellent electrical conductivity—made it an invaluable resource for the booming manufacturing sectors. Within a few decades, aluminum transitioned from a jeweler's curiosity to a foundational material in modern transportation, construction, and electrical engineering.",authored,internal_set_v3,2026-05-06T00:00:00Z,2026-05-06T00:00:00Z

## 3) Learner Responses (core for skill diagnosis)

Recommended file: learner_responses.csv

Required columns:
- response_id
- user_id_hash
- session_id
- item_id
- section
- selected_option
- is_correct
- response_time_ms
- confidence_1_to_5
- answered_at
- device_type
- mode

Optional but useful columns:
- attempt_index_for_item
- changed_answer
- ui_version
- latency_bucket

Notes:
- user_id_hash must be anonymized and consistent
- mode values: practice, mock

Example row:

response_id,user_id_hash,session_id,item_id,section,selected_option,is_correct,response_time_ms,confidence_1_to_5,answered_at,device_type,mode,attempt_index_for_item,changed_answer
RSP_900001,u_2f71d1,SES_20260506_001,ITP_R_000123,reading,B,0,38200,2,2026-05-06T09:12:45Z,mobile,practice,1,0

## 4) Tutor Feedback / Diagnosis Labels

Recommended file: tutor_feedback.csv

Required columns:
- feedback_id
- user_id_hash
- session_id
- evaluated_at
- weakness_subskills
- diagnosis_summary
- recommendation_plan
- priority_level
- expected_time_to_improve_days
- followup_due_at

Optional outcome columns:
- followup_completed_at
- outcome_label
- outcome_notes

Notes:
- weakness_subskills can be pipe-separated tags, example: inference|reference|article_usage
- priority_level values: low, medium, high
- outcome_label values: improved, unchanged, worse

Example row:

feedback_id,user_id_hash,session_id,evaluated_at,weakness_subskills,diagnosis_summary,recommendation_plan,priority_level,expected_time_to_improve_days,followup_due_at,followup_completed_at,outcome_label,outcome_notes
FDB_400123,u_2f71d1,SES_20260506_001,2026-05-06T09:40:00Z,"inference|tone_detection","Frequently misses implied meaning and stance cues.","Daily 20 inference questions + 10 tone items + error log review every 3 days.",high,21,2026-05-27T00:00:00Z,2026-05-28T00:00:00Z,improved,"Reading inference accuracy rose from 48% to 67%."

## 5) Skill Map and Recommendation Graph

Recommended file: skill_map.csv

Required columns:
- subskill_id
- section
- subskill_name
- description
- prerequisite_subskills
- recommended_drill_type
- min_items_for_reliable_estimate
- mastery_threshold
- remediation_template_id

Notes:
- prerequisite_subskills can be pipe-separated IDs
- mastery_threshold is percentage (0 to 100)

Example row:

subskill_id,section,subskill_name,description,prerequisite_subskills,recommended_drill_type,min_items_for_reliable_estimate,mastery_threshold,remediation_template_id
RD_INF_01,reading,inference,Infer implicit meaning from evidence,RD_MAIN_01|RD_REF_01,targeted_mcq_set,25,75,REM_INF_A

## 6) Remediation Templates (for generated plans)

Recommended file: remediation_templates.csv

Required columns:
- remediation_template_id
- title
- objective
- daily_minutes
- activity_sequence
- stop_condition
- escalation_rule

Example row:

remediation_template_id,title,objective,daily_minutes,activity_sequence,stop_condition,escalation_rule
REM_INF_A,"Inference Booster","Raise inference accuracy to >= 75",30,"10 inference MCQ -> 5 explanation rewrites -> 5 timed items",">=75% on last 30 items","If <60% after 14 days, assign tutor intervention"

## 7) Minimal Label Set for Subskills

Start with this controlled tag list:
- Listening: gist, detail, function, inference, idiom
- Structure: verb_tense, subject_verb_agreement, pronoun_reference, article_usage, parallelism, reduced_clause
- Reading: main_idea, detail, inference, vocabulary_in_context, reference, tone_purpose

Keep tags stable. Do not frequently rename tags after data collection starts.

## 8) Data Quality Rules

- One canonical item_id per question version.
- Never overwrite historical learner responses.
- Keep explanation_short under 240 chars for UI.
- Keep explanation_long tutor-quality and evidence-based.
- Validate selected_option in A-D.
- Validate response_time_ms >= 0.
- Deduplicate by response_id.
- Use UTC timestamps.

## 9) Train/Eval Splits

For reliable evaluation:
- Split by user_id_hash to avoid leakage.
- Keep at least one full month as time-based holdout.
- Build subskill-stratified validation slices.

## 10) Privacy and Compliance

- Store only anonymized learner identifiers.
- Do not store raw personal information in training tables.
- Keep licensing metadata per item (source_type, source_ref).
- Exclude copyrighted exam items unless you have explicit rights.

## 11) Suggested First Milestone

If you need a fast start, begin with only four files:
- item_bank.csv (with passage_id references)
- passages.csv (for reading comprehension passages)
- learner_responses.csv
- skill_map.csv

Then add tutor_feedback.csv once manual review workflow is ready.
