"""Run with: python -m unittest discover -s tests/assembly -p 'test_*.py'."""
import importlib.util
from pathlib import Path
import unittest
import numpy as np

spec = importlib.util.spec_from_file_location("audit", Path(__file__).parents[2] / "scripts/audit-existing-mark-2.py")
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class AudioTimingMatchTests(unittest.TestCase):
    def test_finds_recorded_speech_after_an_intro_despite_gain_and_noise(self):
        rng = np.random.default_rng(9)
        source = rng.normal(0, .1, 16000).astype(np.float32)
        target = rng.normal(0, .001, 64000).astype(np.float32)
        target[12345:28345] += source * .5
        result = audit.match_audio(target, source)
        self.assertEqual(result["startMs"], 12345 / 4)
        self.assertGreater(result["score"], .99)

    def test_silence_never_proves_coverage(self):
        silence = np.zeros(8000, dtype=np.float32)
        self.assertIsNone(audit.match_audio(silence, silence)["startMs"])

    def test_a_matching_tail_does_not_prove_the_missing_beginning(self):
        rng = np.random.default_rng(10)
        source = rng.normal(0, .1, 16000).astype(np.float32)
        target = np.zeros(40000, dtype=np.float32)
        target[16000:24000] = source[8000:]
        self.assertLess(audit.match_audio(target, source)["score"], .8)
        self.assertGreater(audit.match_audio(target, source[8000:])["score"], .99)
        self.assertLess(audit.match_audio(target, source[:8000])["score"], .1)


if __name__ == "__main__":
    unittest.main()
