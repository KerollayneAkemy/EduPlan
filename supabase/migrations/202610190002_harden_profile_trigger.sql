-- Restrict the trigger-only helper and pin its object lookup path.
alter function public.touch_updated_at() set search_path = '';
revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;
