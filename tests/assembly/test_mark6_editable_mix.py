"""Source preservation checks for the retained Mark6 assembly recipe artifact."""
import copy
import hashlib
import importlib.util
import pathlib
import struct
import tempfile
import unittest
import wave

SCRIPT = pathlib.Path(__file__).resolve().parents[2] / 'outputs/mark6-production/editable-mix/render_source_clock_mix.py'
spec = importlib.util.spec_from_file_location('mark6_mix', SCRIPT)
mix = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mix)


class MixRecipeTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = pathlib.Path(self.tmp.name)
        self.samples = struct.pack('<12h', 123, -123, 32700, -32600, 0, 0, 1, -1, 734, -573, 0, 0)
        with wave.open(str(self.root / 'source.wav'), 'wb') as w:
            w.setparams((2, 2, 24000, 0, 'NONE', 'not compressed'))
            w.writeframes(self.samples)
        self.recipe = {'version': 1, 'source': {'path': 'source.wav', 'sha256': hashlib.sha256((self.root/'source.wav').read_bytes()).hexdigest(), 'frames': 6},
                       'outputPath': 'rebuilt.wav', 'targetFrames': 13,
                       'placements': [dict(sourceStartFrame=0, sourceEndFrame=3, targetStartFrame=2, targetEndFrame=5),
                                      dict(sourceStartFrame=3, sourceEndFrame=6, targetStartFrame=7, targetEndFrame=10)]}

    def test_exact_samples_with_opening_pause_and_credits(self):
        report = mix.render(self.root, self.recipe)
        with wave.open(str(self.root/'rebuilt.wav'), 'rb') as w:
            self.assertEqual(w.readframes(13), bytes(8)+self.samples[:12]+bytes(8)+self.samples[12:]+bytes(12))
        self.assertTrue(report['sourcePcmComparedExactly'])
        self.assertEqual(report['sourceFramesPreserved'], 6)

    def test_relocated_root_needs_no_original_paths(self):
        other = self.root/'restored'; other.mkdir()
        (other/'source.wav').write_bytes((self.root/'source.wav').read_bytes())
        (self.root/'source.wav').unlink()
        self.assertEqual(mix.render(other, self.recipe)['sourceFramesPreserved'], 6)

    def test_rejects_omitted_quiet_tail(self):
        self.recipe['placements'].pop()
        with self.assertRaisesRegex(ValueError, 'Complete source'):
            mix.render(self.root, self.recipe)
        self.assertFalse((self.root/'rebuilt.wav').exists())

    def test_rejects_repeated_source_or_retiming(self):
        for key, value in [('sourceStartFrame', 2), ('targetEndFrame', 11), ('targetStartFrame', 4)]:
            recipe = copy.deepcopy(self.recipe); recipe['placements'][1][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                mix.render(self.root, recipe)
        self.assertFalse((self.root/'rebuilt.wav').exists())

    def test_rejects_changed_approved_mix(self):
        self.recipe['source']['sha256'] = '0'*64
        with self.assertRaisesRegex(ValueError, 'hash changed'):
            mix.render(self.root, self.recipe)

    def test_preserves_existing_output(self):
        (self.root/'rebuilt.wav').write_bytes(b'retained')
        with self.assertRaisesRegex(ValueError, 'never overwrite'):
            mix.render(self.root, self.recipe)
        self.assertEqual((self.root/'rebuilt.wav').read_bytes(), b'retained')

    def test_rejects_external_dependency(self):
        self.recipe['source']['path'] = '../source.wav'
        with self.assertRaisesRegex(ValueError, 'inside'):
            mix.render(self.root, self.recipe)


if __name__ == '__main__':
    unittest.main()
