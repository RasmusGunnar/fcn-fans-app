-- Restrict every function introduced by Stadium Live V1 to its intended callers.

revoke execute on function public.set_stadium_live_preferences_updated_at()
  from public, anon, authenticated, service_role;
revoke execute on function public.is_stadium_live_match_open(uuid, timestamptz)
  from public, anon, authenticated, service_role;
revoke execute on function public.is_stadium_live_blocked(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.get_stadium_live_preferences()
  from public, anon, authenticated, service_role;
revoke execute on function public.update_stadium_live_preferences(boolean, boolean, text)
  from public, anon, authenticated, service_role;
revoke execute on function public.get_match_checkin_snapshot(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.get_stadium_live_count(uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.get_stadium_live_participants(uuid, integer, uuid, integer)
  from public, anon, authenticated, service_role;
revoke execute on function public.send_stadium_reaction(uuid, uuid, text, uuid)
  from public, anon, authenticated, service_role;
revoke execute on function public.get_stadium_reactions(uuid, timestamptz, uuid, integer)
  from public, anon, authenticated, service_role;

grant execute on function public.get_stadium_live_preferences()
  to authenticated;
grant execute on function public.update_stadium_live_preferences(boolean, boolean, text)
  to authenticated;
grant execute on function public.get_match_checkin_snapshot(uuid)
  to authenticated;
grant execute on function public.get_stadium_live_count(uuid)
  to authenticated;
grant execute on function public.get_stadium_live_participants(uuid, integer, uuid, integer)
  to authenticated;
grant execute on function public.send_stadium_reaction(uuid, uuid, text, uuid)
  to authenticated;
grant execute on function public.get_stadium_reactions(uuid, timestamptz, uuid, integer)
  to authenticated;

-- The authenticated SELECT policy on social_reactions invokes this fail-closed helper.
grant execute on function public.is_stadium_live_blocked(uuid, uuid)
  to authenticated;
