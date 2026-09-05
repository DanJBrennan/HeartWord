"""
Real vocal/music source separation for HeartWord source audio, using the
pretrained Demucs "htdemucs" model.

WHY THIS EXISTS: mark-2-drama.ts (version-2 of the quote-alignment
exercise) had to fall back to a classical DSP heuristic (a modulation-
based spectral gate) and a hand-tuned silence-detection noise floor,
because Demucs's own pretrained-weight download (huggingface.co /
dl.fbaipublicfiles.com) is blocked by an org-level network egress policy
in every automated environment this pipeline runs in. This script
sidesteps that entirely: it loads the weights from a LOCAL file instead
of fetching them, so it needs network access only once, when a human
downloads that one file through their own already-authenticated browser.

ONE-TIME SETUP (only needed again for a new machine, or if the weights
file is ever lost):
  1. In a browser logged into Hugging Face, go to
     https://huggingface.co/adefossez/HTDemucs/tree/main
  2. Download `955717e8.safetensors` (~84 MB). That's the entire
     "htdemucs" model -- it's a single-model bag, not several files.
  3. Save it as HEARTWORD_DATA_DIR/tools/955717e8.safetensors (this
     script's default --weights path).

USAGE:
  pip install demucs soundfile --break-system-packages   # torch pulls in automatically
  python3 separate_audio.py <input_audio> <vocals_out.wav> <music_out.wav> [--weights PATH]

WHAT IT PRODUCES: htdemucs actually splits into 4 stems (drums, bass,
other, vocals). For a dialogue-plus-orchestral-underscore recording like
FCBH's drama edition, "drums" and "bass" come back almost silent (there's
no rhythm section in this kind of light orchestral score), so this script
sums drums+bass+other into a single "music" stem and keeps vocals
separate -- the two things HeartWord's pipeline actually needs: a clean
dialogue track (for pitch/timbre-based speaker corroboration and for
silence/pause detection without a music-raised noise floor) and a clean
instrumental track (for reading the score's own dynamics -- swells,
recedes -- to brief composers/sound designers on emotional pacing).

This is real neural source separation, not a heuristic: validated on the
Hatam Mark 2 drama recording by comparing librosa.pyin pitch tracking on
the raw mix vs. the separated vocals stem at two speaker-transition
points -- the raw mix showed pitch estimates alternating between two
exact-octave values (~110 Hz / ~220 Hz) regardless of which character was
speaking (a classic F0-estimator confusion caused by a periodic bass/pad
note in the underscore); that alternation is gone entirely once the
vocals are properly isolated. See docs/ARCHITECTURE.md for the full
write-up.
"""
import sys
import argparse
import torch
import soundfile as sf
from demucs.hf import load_safetensors_model
from demucs.apply import apply_model, BagOfModels
from demucs.audio import AudioFile


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input_audio")
    parser.add_argument("vocals_out")
    parser.add_argument("music_out")
    parser.add_argument("--weights", default=None,
                         help="Path to 955717e8.safetensors (default: $HEARTWORD_DATA_DIR/tools/955717e8.safetensors)")
    args = parser.parse_args()

    weights = args.weights
    if weights is None:
        import os
        data_dir = os.environ.get("HEARTWORD_DATA_DIR")
        if not data_dir:
            sys.exit("No --weights given and HEARTWORD_DATA_DIR is not set.")
        weights = os.path.join(data_dir, "tools", "955717e8.safetensors")

    print(f"Loading htdemucs weights from {weights} (offline, no network)...")
    model = load_safetensors_model(weights)
    bag = BagOfModels([model])
    bag.eval()

    print(f"Loading {args.input_audio}...")
    wav = AudioFile(args.input_audio).read(streams=0, samplerate=bag.samplerate, channels=bag.audio_channels)
    wav = wav.unsqueeze(0)

    print(f"Separating ({wav.shape[-1] / bag.samplerate:.1f}s of audio, CPU, this takes a few minutes)...")
    with torch.no_grad():
        sources = apply_model(bag, wav, device="cpu", progress=True, split=True, overlap=0.25)
    sources = sources[0]

    stems = dict(zip(bag.sources, sources))
    vocals = stems["vocals"].numpy().T
    music = (stems["drums"] + stems["bass"] + stems["other"]).numpy().T

    sf.write(args.vocals_out, vocals, bag.samplerate)
    sf.write(args.music_out, music, bag.samplerate)
    print(f"Wrote {args.vocals_out} and {args.music_out} at {bag.samplerate} Hz")


if __name__ == "__main__":
    main()
