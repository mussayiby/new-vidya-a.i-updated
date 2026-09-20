/**
 * Vidya A.I. — Real AI Tutor
 *
 * Shared types for:
 * - teacher lesson uploads
 * - original lesson media
 * - AI transcription
 * - topic detection
 * - language translation
 * - translated narration
 * - topic assessments
 * - student attempts
 * - remediation
 * - processing jobs
 */

export type AITutorJobStatus =
  | "queued"
  | "uploading"
  | "transcribing"
  | "analyzing"
  | "detecting_topics"
  | "generating_questions"
  | "translating"
  | "generating_audio"
  | "generating_video"
  | "ready"
  | "failed";

export type AITutorLessonStatus =
  | "draft"
  | "processing"
  | "ready"
  | "failed";

export type AITutorQuestionType =
  | "mcq"
  | "short_answer"
  | "true_false";

export type AITutorAttemptResult =
  | "passed"
  | "failed";

export type AITutorMediaType =
  | "video"
  | "audio";

export interface AITutorLanguage {
  code: string;
  name: string;
  locale: string;
}

export interface AITutorLesson {
  id: string;
  teacherId: string;

  title: string;
  description: string | null;

  classLevel: string;
  subject: string;
  chapter: string | null;

  teacherLanguage: string;

  targetLanguages: string[];

  originalMediaPath: string | null;
  originalMediaType: AITutorMediaType | null;

  status: AITutorLessonStatus;

  durationSeconds: number | null;

  createdAt: string;
  updatedAt: string;
}

export interface AITutorProcessingJob {
  id: string;
  lessonId: string;

  status: AITutorJobStatus;

  progress: number;

  currentStep: string | null;

  errorMessage: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface AITutorTranscriptSegment {
  id: string;

  lessonId: string;

  startTime: number;
  endTime: number;

  text: string;

  confidence: number | null;

  speaker: string | null;
}

export interface AITutorTopic {
  id: string;

  lessonId: string;

  topicIndex: number;

  title: string;

  summary: string;

  learningObjective: string | null;

  startTime: number;

  endTime: number;

  transcript: string;

  concepts: string[];

  keywords: string[];

  createdAt: string;
}

export interface AITutorTranslation {
  id: string;

  lessonId: string;
  topicId: string;

  sourceLanguage: string;
  targetLanguage: string;

  sourceText: string;
  translatedText: string;

  audioPath: string | null;
  videoPath: string | null;

  status:
    | "pending"
    | "translating"
    | "audio_generating"
    | "video_generating"
    | "ready"
    | "failed";

  createdAt: string;
  updatedAt: string;
}

export interface AITutorQuestionOption {
  id: string;

  text: string;

  /**
   * This should never be exposed to the student UI.
   * It is used only for server-side evaluation.
   */
  isCorrect: boolean;
}

export interface AITutorQuestion {
  id: string;

  lessonId: string;
  topicId: string;

  questionIndex: number;

  type: AITutorQuestionType;

  question: string;

  options: AITutorQuestionOption[];

  correctAnswer: string | null;

  explanation: string;

  difficulty: "easy" | "medium" | "hard";

  language: string;

  createdAt: string;
}

export interface AITutorStudentAttempt {
  id: string;

  lessonId: string;
  topicId: string;
  questionId: string;

  studentId: string;

  answer: string;

  isCorrect: boolean;

  result: AITutorAttemptResult;

  feedback: string | null;

  createdAt: string;
}

export interface AITutorTopicResult {
  topicId: string;

  studentId: string;

  questionsAnswered: number;

  questionsCorrect: number;

  score: number;

  passed: boolean;

  completedAt: string;
}

export interface AITutorMastery {
  id: string;

  studentId: string;

  lessonId: string;

  topicId: string;

  attempts: number;

  bestScore: number;

  currentScore: number;

  passed: boolean;

  masteryLevel:
    | "not_started"
    | "learning"
    | "developing"
    | "mastered";

  updatedAt: string;
}

export interface AITutorRemedialLesson {
  id: string;

  lessonId: string;
  topicId: string;

  studentId: string;

  reason: string;

  misconception: string;

  explanation: string;

  targetLanguage: string;

  audioPath: string | null;
  videoPath: string | null;

  status:
    | "pending"
    | "generating"
    | "ready"
    | "failed";

  createdAt: string;
  updatedAt: string;
}

export interface AITutorLessonInput {
  title: string;

  description?: string;

  classLevel: string;

  subject: string;

  chapter?: string;

  teacherLanguage: string;

  targetLanguages: string[];
}

export interface AITutorProcessingResult {
  lessonId: string;

  status: AITutorLessonStatus;

  topicsDetected: number;

  translationsGenerated: number;

  questionsGenerated: number;

  targetLanguages: string[];
}

export interface AITutorStudentLesson {
  lesson: AITutorLesson;

  topics: AITutorTopic[];

  translations: AITutorTranslation[];

  completedTopicIds: string[];

  currentTopicId: string | null;
}

export interface AITutorTopicAssessment {
  topic: AITutorTopic;

  questions: AITutorQuestion[];

  translation: AITutorTranslation | null;

  mastery: AITutorMastery | null;
}

export interface AITutorAnswerSubmission {
  lessonId: string;

  topicId: string;

  questionId: string;

  answer: string;

  language: string;
}

export interface AITutorAnswerEvaluation {
  questionId: string;

  isCorrect: boolean;

  feedback: string;

  topicPassed: boolean;

  score: number;

  shouldGenerateRemedialLesson: boolean;
}

export interface AITutorRemedialRequest {
  lessonId: string;

  topicId: string;

  studentId: string;

  targetLanguage: string;

  failedQuestionIds: string[];

  incorrectAnswers: string[];
}

export interface AITutorVoiceSettings {
  provider: "ai4bharat-indic-tts-v1";

  language: string;

  voiceGender: "female";

  voiceId: string;

  speakingStyle: "natural";

  /**
   * Keep this voice configuration stable for a student/language
   * so the AI tutor sounds consistent throughout the lesson.
   */
  consistencyKey: string;
}

export interface AITutorVideoGenerationRequest {
  lessonId: string;

  topicId: string;

  sourceVideoPath: string;

  translatedAudioPath: string;

  targetLanguage: string;

  preserveOriginalVisuals: boolean;

  naturalLipSync: boolean;

  voice: AITutorVoiceSettings;
}

export interface AITutorVideoGenerationResult {
  videoPath: string;

  durationSeconds: number;

  targetLanguage: string;

  voice: AITutorVoiceSettings;

  status: "ready" | "failed";
}