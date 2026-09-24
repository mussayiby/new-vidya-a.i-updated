grant select on public.live_messages to authenticated;
grant insert on public.live_messages to authenticated;

alter table public.live_messages enable row level security;

drop policy if exists "Teachers can read messages for their classrooms" on public.live_messages;
drop policy if exists "Students can read joined class messages" on public.live_messages;
drop policy if exists "Teachers can post class messages" on public.live_messages;

create policy "Teachers can read messages for their classrooms"
on public.live_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.live_classes lc
    where lc.id = live_messages.class_id
      and (
        lc.teacher_id = auth.uid()
        or exists (
          select 1
          from public.classroom_members cm
          where cm.classroom_id = lc.id
            and cm.user_id = auth.uid()
        )
      )
  )
);

create policy "Students can read joined class messages"
on public.live_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.classroom_members cm
    where cm.classroom_id = live_messages.class_id
      and cm.user_id = auth.uid()
  )
);

create policy "Teachers can post class messages"
on public.live_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.live_classes lc
    where lc.id = live_messages.class_id
      and lc.teacher_id = auth.uid()
  )
);
