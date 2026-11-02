-- The name poll speaks to the lifters who use the app, not to "users".
begin;
update public.polls
  set description = '使っているマッチョ達と一緒に、アプリの名前を決めたいと思います。結果を参考に運営が決めます。'
  where id = 'b0110000-0000-4000-8000-000000000001';
commit;
