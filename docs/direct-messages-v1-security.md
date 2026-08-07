# Direct Messages V1 security notes

## Profile directory boundary

Direct-message user search only calls `search_direct_message_users`. The SECURITY DEFINER RPC
returns the explicit allowlist `id`, `display_name`, `username`, `avatar_url`, and `fan_level_key`,
plus the computed mutual-community count. It never returns email, push-token, or internal profile
fields.

The repository still contains authenticated app features that read additional columns directly
from `profiles`. Revoking the existing broad table grant in this migration would break those
features without a complete profile-read migration. V1 therefore leaves that legacy grant in
place and treats it as a concrete residual privacy risk outside the DM search path. A later
hardening pass should replace broad profile reads with purpose-specific views/RPCs before revoking
the table-level grant.

## Mutation and delivery boundaries

- Clients cannot insert conversations or messages directly. Canonical creation and idempotent send
  use authenticated SECURITY DEFINER RPCs.
- Message insertion and the Notification Engine v2 outbox job are committed in one transaction.
- The authenticated `push_direct_message` function can only wake an existing job for a message
  owned by the caller. Queue workers remain protected by `sync_secret`.
- Direct-message jobs are excluded from the ordinary notification-center mirror. Message unread is
  computed from conversation read pointers; the OS badge is the sum of both authoritative counts.
- Reports store metadata only and never copy message bodies or transcripts.
