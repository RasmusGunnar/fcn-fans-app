-- The legacy permissive actor policy bypassed the restricted client INSERT policy.
drop policy if exists "Users can insert notifications"
on public.notifications;
