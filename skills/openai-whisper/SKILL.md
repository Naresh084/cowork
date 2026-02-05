---
name: openai-whisper
description: "Local speech-to-text with the Whisper CLI (no API key)."
homepage: https://openai.com/research/whisper
license: MIT
metadata: {
    "author": "geminicowork",
    "emoji": "🎤",
    "version": "1.0.0",
    "category": "creative"
  }
---

# Whisper (CLI)

Use `whisper` to transcribe audio locally.

Quick start

- `whisper /path/audio.mp3 --model medium --output_format txt --output_dir .`
- `whisper /path/audio.m4a --task translate --output_format srt`

Notes

- Models download to `~/.cache/whisper` on first run.
- `--model` defaults to `turbo` on this install.
- Use smaller models for speed, larger for accuracy.