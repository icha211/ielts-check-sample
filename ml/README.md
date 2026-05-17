# ML

Training and evaluation assets for the future domain-specific model stack live here.

- `datasets/raw/`: source data before normalization.
- `datasets/processed/`: cleaned SFT/RM/PPO-ready datasets.
- `datasets/preferences/`: human preference data for reward modeling and PPO.
- `sft-training/`: supervised fine-tuning code.
- `reward-model/`: reward model training and calibration.
- `ppo/`: human-feedback-driven PPO training flows.
- `evaluation/`: offline benchmarks and regression checks.
- `adapters/`: LoRA adapters and metadata.

Keep model-training code isolated from the current website runtime.