create table if not exists public.ai_video_classrooms (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^VIDYA-[A-Z0-9]{6}$'),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  class_level text not null check (char_length(btrim(class_level)) between 1 and 100),
  subject text not null check (char_length(btrim(subject)) between 1 and 160),
  topic text not null check (char_length(btrim(topic)) between 1 and 200),
  chapter text,
  teacher_language text not null check (char_length(btrim(teacher_language)) between 2 and 20),
  difficulty text not null check (difficulty in ('beginner', 'intermediate', 'advanced')),
  learning_objectives text not null check (char_length(btrim(learning_objectives)) between 1 and 4000),
  teaching_instructions text,
  video_path text,
  video_name text,
  video_mime_type text,
  video_size bigint,
  duration_seconds numeric,
  status text not null default 'draft' check (status in ('draft', 'uploading', 'analyzing', 'ready', 'failed')),
  status_message text,
  published boolean not null default false,
  knowledge_map jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_video_classroom_topics (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.ai_video_classrooms(id) on delete cascade,
  topic_index integer not null check (topic_index >= 0),
  title text not null,
  summary text not null,
  start_time numeric not null check (start_time >= 0),
  end_time numeric not null check (end_time >= start_time),
  concepts jsonb not null default '[]'::jsonb,
  definitions jsonb not null default '[]'::jsonb,
  examples jsonb not null default '[]'::jsonb,
  misconceptions jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  unique (classroom_id, topic_index)
);

create table if not exists public.ai_video_classroom_checkpoints (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.ai_video_classrooms(id) on delete cascade,
  topic_id uuid not null references public.ai_video_classroom_topics(id) on delete cascade,
  checkpoint_index integer not null check (checkpoint_index >= 0),
  timestamp_seconds numeric not null check (timestamp_seconds >= 0),
  question text not null,
  expected_answer text not null,
  remediation text not null,
  mini_quiz_question text,
  created_at timestamptz not null default now(),
  unique (classroom_id, checkpoint_index)
);

create table if not exists public.ai_video_classroom_members (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.ai_video_classrooms(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  language text not null check (char_length(btrim(language)) between 2 and 20),
  learning_style text,
  learning_preference text,
  joined_at timestamptz not null default now(),
  unique (classroom_id, student_id)
);

create table if not exists public.ai_video_classroom_progress (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.ai_video_classrooms(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  current_checkpoint_id uuid references public.ai_video_classroom_checkpoints(id) on delete set null,
  last_position_seconds numeric not null default 0 check (last_position_seconds >= 0),
  completed boolean not null default false,
  time_spent_seconds numeric not null default 0 check (time_spent_seconds >= 0),
  updated_at timestamptz not null default now(),
  unique (classroom_id, student_id)
);

create table if not exists public.ai_video_classroom_attempts (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.ai_video_classrooms(id) on delete cascade,
  checkpoint_id uuid not null references public.ai_video_classroom_checkpoints(id) on delete cascade,
  student_id uuid not null references auth.users(id) on delete cascade,
  answer text not null check (char_length(btrim(answer)) between 1 and 4000),
  result text not null check (result in ('correct', 'partial', 'incorrect')),
  feedback text not null,
  missing_concept text,
  next_action text not null check (next_action in ('continue', 'remediate', 'escalate')),
  created_at timestamptz not null default now()
);

create index if not exists ai_video_classrooms_teacher_idx on public.ai_video_classrooms(teacher_id, updated_at desc);
create index if not exists ai_video_classrooms_code_idx on public.ai_video_classrooms(code);
create index if not exists ai_video_topics_classroom_idx on public.ai_video_classroom_topics(classroom_id, topic_index);
create index if not exists ai_video_checkpoints_classroom_idx on public.ai_video_classroom_checkpoints(classroom_id, checkpoint_index);
create index if not exists ai_video_members_student_idx on public.ai_video_classroom_members(student_id, joined_at desc);

alter table public.ai_video_classrooms enable row level security;
alter table public.ai_video_classroom_topics enable row level security;
alter table public.ai_video_classroom_checkpoints enable row level security;
alter table public.ai_video_classroom_members enable row level security;
alter table public.ai_video_classroom_progress enable row level security;
alter table public.ai_video_classroom_attempts enable row level security;

create or replace function public.is_ai_video_classroom_member(target_classroom_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.ai_video_classroom_members
    where classroom_id = target_classroom_id and student_id = auth.uid()
  );
$$;

create policy "Teachers manage their AI video classrooms" on public.ai_video_classrooms
  for all to authenticated using (teacher_id = auth.uid()) with check (teacher_id = auth.uid());
create policy "Students read published AI video classrooms" on public.ai_video_classrooms
  for select to authenticated using (published = true and public.is_ai_video_classroom_member(id));

create policy "Members read AI video topics" on public.ai_video_classroom_topics
  for select to authenticated using (
    exists (select 1 from public.ai_video_classrooms c where c.id = classroom_id and c.teacher_id = auth.uid())
    or public.is_ai_video_classroom_member(classroom_id)
  );
create policy "Members read AI video checkpoints" on public.ai_video_classroom_checkpoints
  for select to authenticated using (
    exists (select 1 from public.ai_video_classrooms c where c.id = classroom_id and c.teacher_id = auth.uid())
    or public.is_ai_video_classroom_member(classroom_id)
  );

create policy "Students read their AI video memberships" on public.ai_video_classroom_members
  for select to authenticated using (student_id = auth.uid());
create policy "Students join published AI video classrooms" on public.ai_video_classroom_members
  for insert to authenticated with check (
    student_id = auth.uid()
    and exists (
      select 1 from public.ai_video_classrooms c
      where c.id = classroom_id and c.published = true and c.status = 'ready'
    )
  );
create policy "Students update their AI video membership" on public.ai_video_classroom_members
  for update to authenticated using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "Students leave AI video classrooms" on public.ai_video_classroom_members
  for delete to authenticated using (student_id = auth.uid());
create policy "Teachers read their AI video memberships" on public.ai_video_classroom_members
  for select to authenticated using (
    exists (select 1 from public.ai_video_classrooms c where c.id = classroom_id and c.teacher_id = auth.uid())
  );

create policy "Students read their AI video progress" on public.ai_video_classroom_progress
  for select to authenticated using (student_id = auth.uid());
create policy "Students write joined AI video progress" on public.ai_video_classroom_progress
  for insert to authenticated with check (
    student_id = auth.uid() and public.is_ai_video_classroom_member(classroom_id)
  );
create policy "Students update their AI video progress" on public.ai_video_classroom_progress
  for update to authenticated using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "Students delete their AI video progress" on public.ai_video_classroom_progress
  for delete to authenticated using (student_id = auth.uid());
create policy "Teachers read AI video progress" on public.ai_video_classroom_progress
  for select to authenticated using (
    exists (select 1 from public.ai_video_classrooms c where c.id = classroom_id and c.teacher_id = auth.uid())
  );

create policy "Students read their AI video attempts" on public.ai_video_classroom_attempts
  for select to authenticated using (student_id = auth.uid());
create policy "Students write joined AI video attempts" on public.ai_video_classroom_attempts
  for insert to authenticated with check (
    student_id = auth.uid() and public.is_ai_video_classroom_member(classroom_id)
  );
create policy "Students update their AI video attempts" on public.ai_video_classroom_attempts
  for update to authenticated using (student_id = auth.uid()) with check (student_id = auth.uid());
create policy "Students delete their AI video attempts" on public.ai_video_classroom_attempts
  for delete to authenticated using (student_id = auth.uid());
create policy "Teachers read AI video attempts" on public.ai_video_classroom_attempts
  for select to authenticated using (
    exists (select 1 from public.ai_video_classrooms c where c.id = classroom_id and c.teacher_id = auth.uid())
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'ai-video-classrooms',
  'ai-video-classrooms',
  false,
  524288000,
  array['video/mp4', 'video/webm', 'video/quicktime']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "AI video teachers upload their files" on storage.objects
  for insert to authenticated with check (
    bucket_id = 'ai-video-classrooms' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "AI video owners and members read files" on storage.objects
  for select to authenticated using (
    bucket_id = 'ai-video-classrooms'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.ai_video_classrooms c
        join public.ai_video_classroom_members m on m.classroom_id = c.id
        where c.video_path = name and m.student_id = auth.uid() and c.published = true
      )
    )
  );
create policy "AI video owners manage files" on storage.objects
  for update to authenticated using (
    bucket_id = 'ai-video-classrooms' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'ai-video-classrooms' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "AI video owners delete files" on storage.objects
  for delete to authenticated using (
    bucket_id = 'ai-video-classrooms' and (storage.foldername(name))[1] = auth.uid()::text
  );

grant execute on function public.is_ai_video_classroom_member(uuid) to authenticated;
