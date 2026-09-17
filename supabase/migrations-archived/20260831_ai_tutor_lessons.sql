

-- ============================================================
-- VIDYA A.I. — DATABASE SCHEMA
-- Profiles + AI Tutor Lessons + Media + Topics + Processing
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- 1. STUDENT PROFILES
-- Required by src/services/profile.service.ts
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,

  name text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',

  class_level text,
  language text NOT NULL DEFAULT 'en',

  subjects text[] NOT NULL DEFAULT ARRAY[]::text[],
  goals text[] NOT NULL DEFAULT ARRAY[]::text[],

  daily_minutes text NOT NULL DEFAULT '30',
  difficulty text NOT NULL DEFAULT 'intermediate',
  learning_style text NOT NULL DEFAULT 'visual',

  notifications jsonb NOT NULL DEFAULT '{
    "dailyReminder": true,
    "weeklyReport": true,
    "achievements": true
  }'::jsonb,

  onboarding_complete boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- 2. AI LESSONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_lessons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  teacher_id text NOT NULL,

  title text NOT NULL,
  description text,

  class_level text NOT NULL,
  subject_id text NOT NULL,

  chapter text,
  topic text NOT NULL,
  subtopic text,

  teacher_language text NOT NULL DEFAULT 'en',
  target_languages text[] NOT NULL DEFAULT ARRAY['en']::text[],

  estimated_duration_minutes integer,

  difficulty text NOT NULL DEFAULT 'intermediate',

  prerequisites text[],
  keywords text[],
  learning_objectives text[],

  pause_after_each_topic boolean NOT NULL DEFAULT true,

  num_questions_per_topic integer NOT NULL DEFAULT 1,

  question_types text[] NOT NULL
    DEFAULT ARRAY['mcq', 'short_answer']::text[],

  status text NOT NULL DEFAULT 'uploaded'
    CHECK (
      status IN (
        'uploaded',
        'queued',
        'processing',
        'transcribing',
        'segmenting',
        'translating',
        'generating_narration',
        'generating_questions',
        'ready',
        'failed',
        'published'
      )
    ),

  error_message text,

  published boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- 3. AI LESSON MEDIA
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_lesson_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  lesson_id uuid NOT NULL
    REFERENCES public.ai_lessons(id)
    ON DELETE CASCADE,

  media_type text NOT NULL
    CHECK (media_type IN ('audio', 'video')),

  storage_path text NOT NULL,

  duration_seconds integer,

  mime_type text,

  file_size_bytes bigint,

  processing_status text NOT NULL DEFAULT 'uploaded'
    CHECK (
      processing_status IN (
        'uploaded',
        'processing',
        'failed',
        'ready'
      )
    ),

  created_at timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- 4. AI LESSON TOPICS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_lesson_topics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  lesson_id uuid NOT NULL
    REFERENCES public.ai_lessons(id)
    ON DELETE CASCADE,

  title text NOT NULL,

  summary text,
  content text,

  start_time_seconds integer,
  end_time_seconds integer,

  order_index integer NOT NULL,

  learning_objective text,

  important_concepts text[],
  keywords text[],

  created_at timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- 5. TRANSCRIPTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_lesson_transcripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  lesson_id uuid NOT NULL
    REFERENCES public.ai_lessons(id)
    ON DELETE CASCADE,

  topic_id uuid
    REFERENCES public.ai_lesson_topics(id)
    ON DELETE SET NULL,

  language text NOT NULL,

  text text NOT NULL,

  start_time_seconds integer,
  end_time_seconds integer,

  confidence real,

  created_at timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- 6. TRANSLATIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_lesson_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  lesson_id uuid NOT NULL
    REFERENCES public.ai_lessons(id)
    ON DELETE CASCADE,

  topic_id uuid
    REFERENCES public.ai_lesson_topics(id)
    ON DELETE SET NULL,

  source_language text NOT NULL,
  target_language text NOT NULL,

  text text NOT NULL,

  created_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (
    lesson_id,
    topic_id,
    source_language,
    target_language
  )
);


-- ============================================================
-- 7. QUESTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_lesson_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  lesson_id uuid NOT NULL
    REFERENCES public.ai_lessons(id)
    ON DELETE CASCADE,

  topic_id uuid
    REFERENCES public.ai_lesson_topics(id)
    ON DELETE SET NULL,

  question_text text NOT NULL,

  question_type text NOT NULL
    CHECK (
      question_type IN (
        'mcq',
        'true_false',
        'fill_blank',
        'short_answer',
        'conceptual',
        'application'
      )
    ),

  options text[],

  correct_answer text NOT NULL,

  explanation text,

  difficulty text NOT NULL DEFAULT 'intermediate',

  order_index integer,

  language text NOT NULL DEFAULT 'en',

  created_at timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- 8. STUDENT ATTEMPTS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_lesson_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  lesson_id uuid NOT NULL
    REFERENCES public.ai_lessons(id)
    ON DELETE CASCADE,

  question_id uuid NOT NULL
    REFERENCES public.ai_lesson_questions(id)
    ON DELETE CASCADE,

  student_id text NOT NULL,

  answer_text text NOT NULL,

  is_correct boolean,

  score real,

  feedback text,

  created_at timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- 9. STUDENT PROGRESS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_lesson_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  lesson_id uuid NOT NULL
    REFERENCES public.ai_lessons(id)
    ON DELETE CASCADE,

  student_id text NOT NULL,

  current_topic_id uuid
    REFERENCES public.ai_lesson_topics(id)
    ON DELETE SET NULL,

  current_position_seconds integer NOT NULL DEFAULT 0,

  completion_percent real NOT NULL DEFAULT 0,

  status text NOT NULL DEFAULT 'not_started'
    CHECK (
      status IN (
        'not_started',
        'in_progress',
        'completed'
      )
    ),

  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (lesson_id, student_id)
);


-- ============================================================
-- 10. PROCESSING JOBS
-- Backend/service-role controlled
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ai_lesson_processing_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  lesson_id uuid NOT NULL
    REFERENCES public.ai_lessons(id)
    ON DELETE CASCADE,

  job_type text NOT NULL
    CHECK (
      job_type IN (
        'transcription',
        'segmentation',
        'translation',
        'narration',
        'questions'
      )
    ),

  status text NOT NULL DEFAULT 'pending'
    CHECK (
      status IN (
        'pending',
        'processing',
        'completed',
        'failed'
      )
    ),

  provider text,

  external_job_id text,

  error_message text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


-- ============================================================
-- 11. INDEXES
-- ============================================================

CREATE INDEX IF NOT EXISTS profiles_email_idx
  ON public.profiles(email);

CREATE INDEX IF NOT EXISTS ai_lessons_teacher_idx
  ON public.ai_lessons(teacher_id);

CREATE INDEX IF NOT EXISTS ai_lessons_status_idx
  ON public.ai_lessons(status);

CREATE INDEX IF NOT EXISTS ai_lessons_published_idx
  ON public.ai_lessons(published);

CREATE INDEX IF NOT EXISTS ai_lesson_media_lesson_idx
  ON public.ai_lesson_media(lesson_id);

CREATE INDEX IF NOT EXISTS ai_lesson_topics_lesson_idx
  ON public.ai_lesson_topics(
    lesson_id,
    order_index
  );

CREATE INDEX IF NOT EXISTS ai_lesson_transcripts_lesson_idx
  ON public.ai_lesson_transcripts(lesson_id);

CREATE INDEX IF NOT EXISTS ai_lesson_translations_lesson_idx
  ON public.ai_lesson_translations(lesson_id);

CREATE INDEX IF NOT EXISTS ai_lesson_questions_lesson_idx
  ON public.ai_lesson_questions(
    lesson_id,
    topic_id
  );

CREATE INDEX IF NOT EXISTS ai_lesson_attempts_student_idx
  ON public.ai_lesson_attempts(student_id);

CREATE INDEX IF NOT EXISTS ai_lesson_progress_student_idx
  ON public.ai_lesson_progress(student_id);

CREATE INDEX IF NOT EXISTS ai_lesson_processing_jobs_lesson_idx
  ON public.ai_lesson_processing_jobs(lesson_id);


-- ============================================================
-- 12. ENABLE RLS
-- ============================================================

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_lessons ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_lesson_media ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_lesson_topics ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_lesson_transcripts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_lesson_translations ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_lesson_questions ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_lesson_attempts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_lesson_progress ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.ai_lesson_processing_jobs ENABLE ROW LEVEL SECURITY;


-- ============================================================
-- 13. PROFILES RLS
-- ============================================================

DROP POLICY IF EXISTS "Users can read own profile"
ON public.profiles;

CREATE POLICY "Users can read own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid());


DROP POLICY IF EXISTS "Users can insert own profile"
ON public.profiles;

CREATE POLICY "Users can insert own profile"
ON public.profiles
FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());


DROP POLICY IF EXISTS "Users can update own profile"
ON public.profiles;

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (id = auth.uid())
WITH CHECK (id = auth.uid());


DROP POLICY IF EXISTS "Users can delete own profile"
ON public.profiles;

CREATE POLICY "Users can delete own profile"
ON public.profiles
FOR DELETE
TO authenticated
USING (id = auth.uid());


-- ============================================================
-- 14. AI LESSON RLS
-- ============================================================

DROP POLICY IF EXISTS "Teachers can create lessons"
ON public.ai_lessons;

CREATE POLICY "Teachers can create lessons"
ON public.ai_lessons
FOR INSERT
TO authenticated
WITH CHECK (
  teacher_id = auth.uid()::text
);


DROP POLICY IF EXISTS "Users can read published or own lessons"
ON public.ai_lessons;

CREATE POLICY "Users can read published or own lessons"
ON public.ai_lessons
FOR SELECT
TO authenticated
USING (
  teacher_id = auth.uid()::text
  OR published = true
);


DROP POLICY IF EXISTS "Teachers can update own lessons"
ON public.ai_lessons;

CREATE POLICY "Teachers can update own lessons"
ON public.ai_lessons
FOR UPDATE
TO authenticated
USING (
  teacher_id = auth.uid()::text
)
WITH CHECK (
  teacher_id = auth.uid()::text
);


DROP POLICY IF EXISTS "Teachers can delete own lessons"
ON public.ai_lessons;

CREATE POLICY "Teachers can delete own lessons"
ON public.ai_lessons
FOR DELETE
TO authenticated
USING (
  teacher_id = auth.uid()::text
);


-- ============================================================
-- 15. MEDIA RLS
-- ============================================================

DROP POLICY IF EXISTS "Lesson media visible to viewers"
ON public.ai_lesson_media;

CREATE POLICY "Lesson media visible to viewers"
ON public.ai_lesson_media
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.ai_lessons
    WHERE ai_lessons.id = ai_lesson_media.lesson_id
      AND (
        ai_lessons.teacher_id = auth.uid()::text
        OR ai_lessons.published = true
      )
  )
);


-- ============================================================
-- 16. TOPICS RLS
-- ============================================================

DROP POLICY IF EXISTS "Lesson topics visible to viewers"
ON public.ai_lesson_topics;

CREATE POLICY "Lesson topics visible to viewers"
ON public.ai_lesson_topics
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.ai_lessons
    WHERE ai_lessons.id = ai_lesson_topics.lesson_id
      AND (
        ai_lessons.teacher_id = auth.uid()::text
        OR ai_lessons.published = true
      )
  )
);


-- ============================================================
-- 17. TRANSCRIPTS RLS
-- ============================================================

DROP POLICY IF EXISTS "Lesson transcripts visible to viewers"
ON public.ai_lesson_transcripts;

CREATE POLICY "Lesson transcripts visible to viewers"
ON public.ai_lesson_transcripts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.ai_lessons
    WHERE ai_lessons.id = ai_lesson_transcripts.lesson_id
      AND (
        ai_lessons.teacher_id = auth.uid()::text
        OR ai_lessons.published = true
      )
  )
);


-- ============================================================
-- 18. TRANSLATIONS RLS
-- ============================================================

DROP POLICY IF EXISTS "Lesson translations visible to viewers"
ON public.ai_lesson_translations;

CREATE POLICY "Lesson translations visible to viewers"
ON public.ai_lesson_translations
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.ai_lessons
    WHERE ai_lessons.id = ai_lesson_translations.lesson_id
      AND (
        ai_lessons.teacher_id = auth.uid()::text
        OR ai_lessons.published = true
      )
  )
);


-- ============================================================
-- 19. QUESTIONS RLS
-- ============================================================

DROP POLICY IF EXISTS "Lesson questions visible to viewers"
ON public.ai_lesson_questions;

CREATE POLICY "Lesson questions visible to viewers"
ON public.ai_lesson_questions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.ai_lessons
    WHERE ai_lessons.id = ai_lesson_questions.lesson_id
      AND (
        ai_lessons.teacher_id = auth.uid()::text
        OR ai_lessons.published = true
      )
  )
);


-- ============================================================
-- 20. ATTEMPTS RLS
-- ============================================================

DROP POLICY IF EXISTS "Students can insert own attempts"
ON public.ai_lesson_attempts;

CREATE POLICY "Students can insert own attempts"
ON public.ai_lesson_attempts
FOR INSERT
TO authenticated
WITH CHECK (
  student_id = auth.uid()::text
);


DROP POLICY IF EXISTS "Students can read own attempts"
ON public.ai_lesson_attempts;

CREATE POLICY "Students can read own attempts"
ON public.ai_lesson_attempts
FOR SELECT
TO authenticated
USING (
  student_id = auth.uid()::text
);


DROP POLICY IF EXISTS "Teachers can read attempts on own lessons"
ON public.ai_lesson_attempts;

CREATE POLICY "Teachers can read attempts on own lessons"
ON public.ai_lesson_attempts
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.ai_lessons
    WHERE ai_lessons.id = ai_lesson_attempts.lesson_id
      AND ai_lessons.teacher_id = auth.uid()::text
  )
);


-- ============================================================
-- 21. PROGRESS RLS
-- ============================================================

DROP POLICY IF EXISTS "Students can read own progress"
ON public.ai_lesson_progress;

CREATE POLICY "Students can read own progress"
ON public.ai_lesson_progress
FOR SELECT
TO authenticated
USING (
  student_id = auth.uid()::text
);


DROP POLICY IF EXISTS "Students can insert own progress"
ON public.ai_lesson_progress;

CREATE POLICY "Students can insert own progress"
ON public.ai_lesson_progress
FOR INSERT
TO authenticated
WITH CHECK (
  student_id = auth.uid()::text
);


DROP POLICY IF EXISTS "Students can update own progress"
ON public.ai_lesson_progress;

CREATE POLICY "Students can update own progress"
ON public.ai_lesson_progress
FOR UPDATE
TO authenticated
USING (
  student_id = auth.uid()::text
)
WITH CHECK (
  student_id = auth.uid()::text
);


-- ============================================================
-- 22. PROCESSING JOBS
-- Backend only
-- ============================================================

-- No authenticated-user policies intentionally.
-- Your backend/Supabase Edge Functions use service_role.


-- ============================================================
-- 23. GRANTS — AUTHENTICATED
-- ============================================================

GRANT SELECT, INSERT, UPDATE, DELETE
ON public.profiles
TO authenticated;


GRANT SELECT, INSERT, UPDATE, DELETE
ON public.ai_lessons
TO authenticated;


GRANT SELECT
ON public.ai_lesson_media
TO authenticated;


GRANT SELECT
ON public.ai_lesson_topics
TO authenticated;


GRANT SELECT
ON public.ai_lesson_transcripts
TO authenticated;


GRANT SELECT
ON public.ai_lesson_translations
TO authenticated;


GRANT SELECT
ON public.ai_lesson_questions
TO authenticated;


GRANT SELECT, INSERT
ON public.ai_lesson_attempts
TO authenticated;


GRANT SELECT, INSERT, UPDATE
ON public.ai_lesson_progress
TO authenticated;


-- ============================================================
-- 24. GRANTS — SERVICE ROLE
-- ============================================================

GRANT ALL
ON public.profiles
TO service_role;

GRANT ALL
ON public.ai_lessons
TO service_role;

GRANT ALL
ON public.ai_lesson_media
TO service_role;

GRANT ALL
ON public.ai_lesson_topics
TO service_role;

GRANT ALL
ON public.ai_lesson_transcripts
TO service_role;

GRANT ALL
ON public.ai_lesson_translations
TO service_role;

GRANT ALL
ON public.ai_lesson_questions
TO service_role;

GRANT ALL
ON public.ai_lesson_attempts
TO service_role;

GRANT ALL
ON public.ai_lesson_progress
TO service_role;

GRANT ALL
ON public.ai_lesson_processing_jobs
TO service_role;


-- ============================================================
-- 25. UPDATED_AT FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ============================================================
-- 26. UPDATED_AT TRIGGERS
-- ============================================================

DROP TRIGGER IF EXISTS profiles_updated_at
ON public.profiles;

CREATE TRIGGER profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


DROP TRIGGER IF EXISTS ai_lessons_updated_at
ON public.ai_lessons;

CREATE TRIGGER ai_lessons_updated_at
BEFORE UPDATE ON public.ai_lessons
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


DROP TRIGGER IF EXISTS ai_lesson_progress_updated_at
ON public.ai_lesson_progress;

CREATE TRIGGER ai_lesson_progress_updated_at
BEFORE UPDATE ON public.ai_lesson_progress
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


DROP TRIGGER IF EXISTS ai_lesson_processing_jobs_updated_at
ON public.ai_lesson_processing_jobs;

CREATE TRIGGER ai_lesson_processing_jobs_updated_at
BEFORE UPDATE ON public.ai_lesson_processing_jobs
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- DONE
-- ============================================================