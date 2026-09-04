# Producer Notifications

## Scope

How HeartWord reaches the producer (Dan, on an iPhone today) when something
needs attention, rather than requiring the producer to keep checking the UI.
This is distinct from `docs/PRODUCT_VISION.md`'s Post Production and
Distribution, which is about the finished video deliverable, not about
alerting a human mid-production.

## When HeartWord Should Notify

Candidate trigger points, drawn from what's already designed elsewhere in
this project:

- A chapter's storyboard is ready for review (see
  `docs/design/shot-planning.md`).
- The role agents disagreed while planning shots and the disagreement wasn't
  resolved automatically (`docs/design/shot-planning.md`'s interaction log).
- The Source Material Validator's assurance score falls below the
  auto-decide threshold and holds an item for a qualified reviewer
  (`docs/PRODUCT_VISION.md`'s Staged Production Workflow).
- Automated media review (`docs/design/automated-quality-control.md`) can't
  confidently approve or reject a returned shot.
- An Illustrated Scripture page is ready for approval
  (`docs/design/illustrated-scripture.md`'s page verification workflow).
- A render/export completes, or a cost-governance gate is approaching or hit
  (`docs/PRODUCT_VISION.md`'s Cost Governance).

Every notification should deep-link back to the specific chapter, page, or
decision that needs attention — using the language/book/chapter navigation
model in `docs/design/timeline.md` — not just announce that "something"
needs review.

## Delivery Channels

Multiple channels are worth having, roughly in order of setup effort:

- **Email.** The simplest baseline — no special integration, and this is
  what a prior attempt at this project already used for page-approval and
  blocker notices. Good default for anything non-urgent.
- **Pushover or ntfy.sh.** A lightweight push-notification service: a few
  lines of server-side code, no app-store presence required, and it
  delivers an actual push notification to an iPhone through the service's
  own app. Cheap to try and a good fit for personal/small-scale use before
  investing further.
- **SMS via Twilio.** Reliable and attention-getting (a text arrives outside
  any app-specific notification settings), at a small per-message cost. A
  good fit for the more urgent/high-priority notifications rather than
  every routine one, given the per-message cost.
- **A real native iOS app, or a web-push-capable PWA.** The best experience
  — rich notification content, deep links straight into the relevant
  screen, no dependence on a third-party service — but the most setup
  effort (an actual app, or a PWA built and configured for web push). This
  is the likely long-term target once notification patterns are well
  understood.

Like generation providers (`docs/ARCHITECTURE.md`'s Provider abstraction
principle), notification delivery should sit behind one interface so a
given event can be routed to one or more channels by configuration, and a
new channel can be added without changing every place in the code that
raises a notification.

## Suggested Approach

Consistent with this project's general preference for proving something
cheaply before investing further (the Draft Room pattern in
`docs/design/media-generation.md`; the Comic/Video Gate pattern in
`docs/design/illustrated-scripture.md`'s lineage): start with email plus
Pushover or ntfy.sh to validate *which* events are actually worth a
notification and how often they fire, try Twilio for the events that prove
urgent enough to warrant a text, and treat a dedicated iOS app or PWA as a
later investment once the notification patterns and volume are proven out
rather than guessed upfront.

## Open questions

- Per-event-type channel routing: which events default to which channel(s),
  and whether the producer can reconfigure that.
- Notification frequency/batching, so routine events don't produce a flood
  of separate pushes.
- Whether a native app or PWA, once built, becomes the single channel or
  stays alongside email/push/SMS as options.
