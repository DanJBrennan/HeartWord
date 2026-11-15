"""
Prototype: can a real speaker-embedding model (Resemblyzer -- a
pretrained voice-verification encoder, GE2E-trained, weights bundled in
the pip package, zero network access needed) distinguish Hatam Mark 2's
voice actors by timbre, where pitch-only analysis couldn't?

Result: NEGATIVE. See docs/ARCHITECTURE.md's "Speaker-embedding (timbre)
corroboration tried, negative result" section for the full writeup and
numbers. Kept here as a reference so this isn't re-attempted blind later,
and as a starting point if a future attempt wants to try a different
model (e.g. a diarization-purpose-built one like pyannote) against the
same test structure.

One-time setup: pip install --break-system-packages resemblyzer
(also needs setuptools<81 for webrtcvad's pkg_resources import, and
librosa -- both likely already present from the Demucs/pitch work).

Run against HEARTWORD_DATA_DIR/assets/source/hatam/mark-2/separated/
vocals.mp3 (or the higher-quality intermediate .wav if you still have
one from separate_audio.py's run) -- edit AUDIO below to point at it.

Test plan (against ground truth already trusted from the hand-authored
decisions + Dan's own ear-confirmation of the 76.458s boundary):
  1. Whole-segment embeddings, grouped by attributed speaker (Jesus,
     narration, Crowd, Scribe) -- do same-speaker segments cluster
     together and separately from other speakers?
  2. Fine 2-second windows straddling several boundaries already treated
     as real speaker changes, vs. 2-second windows placed inside a
     single continuous quotation/narration stretch (no change expected).
"""
import numpy as np
import librosa
from resemblyzer import VoiceEncoder, preprocess_wav

SR = 16000  # resemblyzer's native rate
AUDIO = "sep_vocals.wav"  # point this at the real separated vocals track

SEGMENTS = [
    # (label, speaker, start_s, end_s)
    ("seg0",  "narration", 0.0, 68.955),
    ("q1",    "Jesus",     68.955, 76.458),
    ("seg1",  "narration", 76.458, 95.541),
    ("q3",    "Jesus",     95.541, 113.578),
    ("q4",    "Jesus",     113.578, 132.389),
    ("seg2",  "narration", 132.389, 148.102),
    ("q5",    "Crowd",     148.102, 155.984),
    ("seg3",  "narration", 155.984, 181.828),
    # q6 (181.828-183.208) skipped: 1.4s, too short for a reliable embedding
    ("seg4",  "narration", 183.208, 230.137),
    ("q7",    "Scribe",    230.137, 238.838),
    ("q8",    "Jesus",     238.838, 261.240),
    ("seg5",  "narration", 261.240, 277.527),
    ("q9",    "Crowd",     277.527, 282.518),
    ("seg6",  "narration", 282.518, 289.305),
    ("q10",   "Jesus",     289.305, 366.009),
    ("seg7",  "narration", 366.009, 380.625),
    ("q11",   "Scribe",    380.625, 394.915),
    ("q12",   "Jesus",     394.915, 424.371),
    ("q13",   "Jesus",     424.371, 445.304),
]

print(f"Loading {AUDIO} ...")
y, sr = librosa.load(AUDIO, sr=SR, mono=True)
print(f"  {len(y)/sr:.1f}s at {sr}Hz")

encoder = VoiceEncoder()

def clip(t0, t1):
    return y[int(t0 * sr):int(t1 * sr)]

def embed(t0, t1):
    wav = preprocess_wav(clip(t0, t1), source_sr=sr)
    if len(wav) < sr * 0.5:
        return None
    return encoder.embed_utterance(wav)

def cos(a, b):
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b)))

print("\n=== Step 1: computing one embedding per segment ===")
embeddings = {}
for label, speaker, t0, t1 in SEGMENTS:
    e = embed(t0, t1)
    if e is None:
        print(f"  {label:6s} {speaker:10s} [too short after silence-trim, skipped]")
        continue
    embeddings[label] = (speaker, e)
    print(f"  {label:6s} {speaker:10s} {t1-t0:6.1f}s embedded")

print("\n=== Step 2: within-speaker vs cross-speaker similarity ===")
by_speaker = {}
for label, (speaker, e) in embeddings.items():
    by_speaker.setdefault(speaker, []).append((label, e))

def pair_stats(group_a, group_b, same):
    sims = []
    for la, ea in group_a:
        for lb, eb in group_b:
            if same and la == lb:
                continue
            sims.append((la, lb, cos(ea, eb)))
    return sims

for speaker in by_speaker:
    within = pair_stats(by_speaker[speaker], by_speaker[speaker], same=True)
    seen, uniq = set(), []
    for la, lb, s in within:
        key = tuple(sorted([la, lb]))
        if key in seen:
            continue
        seen.add(key)
        uniq.append((la, lb, s))
    if uniq:
        vals = [s for _, _, s in uniq]
        print(f"  WITHIN {speaker:10s} (n={len(uniq)} pairs): mean={np.mean(vals):.3f}  min={np.min(vals):.3f}  max={np.max(vals):.3f}")

speakers = list(by_speaker.keys())
print()
for i in range(len(speakers)):
    for j in range(i + 1, len(speakers)):
        cross = pair_stats(by_speaker[speakers[i]], by_speaker[speakers[j]], same=False)
        vals = [s for _, _, s in cross]
        print(f"  CROSS  {speakers[i]:10s} vs {speakers[j]:10s} (n={len(cross)} pairs): mean={np.mean(vals):.3f}  min={np.min(vals):.3f}  max={np.max(vals):.3f}")

print("\n=== Step 3: fine boundary probes (2s windows) vs same-speaker interior controls ===")
BOUNDARIES = [
    ("q1->seg1 (Jesus to narration) @76.458s -- Dan ear-confirmed", 74.458, 76.458, 76.458, 78.458),
    ("seg1->q3 (narration to Jesus) @95.541s", 93.541, 95.541, 95.541, 97.541),
    ("q8->seg5 (Jesus to narration) @261.240s", 259.240, 261.240, 261.240, 263.240),
    ("seg2->q5 (narration to Crowd) @148.102s", 146.102, 148.102, 148.102, 150.102),
]
for name, a0, a1, b0, b1 in BOUNDARIES:
    ea, eb = embed(a0, a1), embed(b0, b1)
    if ea is not None and eb is not None:
        print(f"  BOUNDARY  {name}: {cos(ea, eb):.3f}")

CONTROLS = [
    ("q10 interior (Jesus, ~40s apart)", 300.0, 302.0, 340.0, 342.0),
    ("seg0 interior (narration, 40s apart)", 10.0, 12.0, 50.0, 52.0),
    ("seg4 interior (narration, 37s apart)", 190.0, 192.0, 220.0, 222.0),
    ("q12 interior (Jesus, 15s apart)", 400.0, 402.0, 415.0, 417.0),
    ("seg3 interior (narration, 15s apart)", 160.0, 162.0, 175.0, 177.0),
]
for name, a0, a1, b0, b1 in CONTROLS:
    ea, eb = embed(a0, a1), embed(b0, b1)
    if ea is not None and eb is not None:
        print(f"  CONTROL   {name}: {cos(ea, eb):.3f}")
