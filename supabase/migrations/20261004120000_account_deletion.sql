-- Account deletion: a summary for the confirmation screen and the deletion itself.
-- Deleting auth.users cascades through profiles to every per-user table. Custom exercises are
-- removed first: exercises.created_by is "on delete set null", which their check constraint forbids.
begin;
create or replace function public.account_deletion_summary() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception 'ログインが必要です'; end if;
 return jsonb_build_object(
  'workout_days', (select count(*) from public.workouts where user_id = u),
  'set_count', (select count(*) from public.workout_sets s join public.workouts w on w.id = s.workout_id where w.user_id = u),
  'body_log_count', (select count(*) from public.bodyweight_logs where user_id = u),
  'custom_exercise_count', (select count(*) from public.exercises where created_by = u and not is_preset),
  'health_sync_connected', exists (select 1 from health_sync_private.tokens where user_id = u and token_hash is not null),
  'owned_communities', coalesce((select jsonb_agg(jsonb_build_object('name', c.name, 'other_member_count',
      (select count(*) from public.community_members m where m.community_id = c.id and m.user_id <> u)) order by c.created_at, c.id)
    from public.communities c where c.owner_id = u), '[]'::jsonb));
end $$;

create or replace function public.delete_my_account(p_confirm text) returns void
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
 if u is null then raise exception 'ログインが必要です'; end if;
 if p_confirm is distinct from '退会する' then raise exception '確認の文字が一致しません'; end if;
 delete from public.workouts where user_id = u;
 delete from public.big3_exercise_mappings where user_id = u;
 if exists (select 1 from public.workout_sets s join public.exercises e on e.id = s.exercise_id where e.created_by = u and not e.is_preset)
   or exists (select 1 from public.big3_exercise_mappings m join public.exercises e on e.id = m.exercise_id where e.created_by = u and not e.is_preset) then
  raise exception 'ほかの利用者の記録が使っている種目があるため退会できません';
 end if;
 delete from public.exercises where created_by = u and not is_preset;
 delete from auth.users where id = u;
end $$;

revoke all on function public.account_deletion_summary(), public.delete_my_account(text) from public, anon;
grant execute on function public.account_deletion_summary(), public.delete_my_account(text) to authenticated;
commit;
