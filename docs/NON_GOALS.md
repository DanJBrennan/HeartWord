# Non-Goals

Explicitly out of scope, to keep the pipeline focused:

- **Not a general-purpose video editor.** HeartWord produces a starting cut for
  editing elsewhere (or with lightweight in-house review tools) — it is not
  trying to replace Premiere/Resolve/etc.
- **Not a translation tool.** HeartWord consumes an existing heart-language
  audio recording and its translated text; it does not translate or verify
  translation accuracy itself.
- **Not free-form content generation.** The pipeline should not invent
  theological content, dialogue, or narrative beyond what the source narration
  and translated text actually say. Scene/action decisions fill in *how* the
  text is shown, not *what* the text says.
- **Not real-time or interactive.** This is a batch pipeline that produces a
  chapter video from a fixed input; it's not a live/interactive experience.
- **Not language-agnostic out of the box.** Each new heart language/community
  needs its own canon character library and culturally appropriate visual style
  (see `docs/design/canonical-characters.md`) — the pipeline mechanics are
  reusable, the character/style assets are not assumed to transfer automatically.
- **Not dependent on a single hardware/vendor choice at the design level.**
  Specific tool choices (e.g. a lip-sync engine, a voice provider) are
  implementation details tracked in `docs/design/`, not baked into the product
  vision.
