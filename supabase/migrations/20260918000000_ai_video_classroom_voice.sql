alter table public.ai_video_classrooms
  add column if not exists transcript jsonb not null default '[]'::jsonb;

create table if not exists public.ai_video_classroom_translations (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.ai_video_classrooms(id) on delete cascade,
  source_language text not null,
  target_language text not null,
  transcript_version text not null,
  status text not null default 'preparing' check (status in ('preparing', 'ready', 'failed')),
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (classroom_id, target_language, transcript_version)
);

create table if not exists public.ai_video_classroom_translation_segments (
  id uuid primary key default gen_random_uuid(),
  translation_id uuid not null references public.ai_video_classroom_translations(id) on delete cascade,
  segment_index integer not null check (segment_index >= 0),
  start_time numeric not null check (start_time >= 0),
  end_time numeric not null check (end_time >= start_time),
  source_text text not null,
  translated_text text not null,
  audio_path text not null,
  created_at timestamptz not null default now(),
  unique (translation_id, segment_index)
);

create index if not exists ai_video_classroom_translations_lookup_idx
  on public.ai_video_classroom_translations(classroom_id, target_language, transcript_version);
create index if not exists ai_video_classroom_translation_segments_lookup_idx
  on public.ai_video_classroom_translation_segments(translation_id, segment_index);

alter table public.ai_video_classroom_translations enable row level security;
alter table public.ai_video_classroom_translation_segments enable row level security;

create policy "Classroom members read voice translations"
  on public.ai_video_classroom_translations
  for select to authenticated using (
    exists (
      select 1 from public.ai_video_classrooms c
      where c.id = classroom_id
        and (c.teacher_id = auth.uid() or (c.published and public.is_ai_video_classroom_member(c.id)))
    )
  );

create policy "Classroom members read voice segments"
  on public.ai_video_classroom_translation_segments
  for select to authenticated using (
    exists (
      select 1
      from public.ai_video_classroom_translations t
      join public.ai_video_classrooms c on c.id = t.classroom_id
      where t.id = translation_id
        and (c.teacher_id = auth.uid() or (c.published and public.is_ai_video_classroom_member(c.id)))
    )
  );

update storage.buckets
set allowed_mime_types = array[
  'video/mp4', 'video/webm', 'video/quicktime',
  'audio/wav', 'audio/mpeg'
]
where id = 'ai-video-classrooms';
