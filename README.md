# Vidya A.I. Learning Platform

## Video classroom setup

The classroom pipeline uses Gemini to analyze the uploaded lesson and translate its timestamped transcript, then uses the local AI4Bharat Indic-TTS service to generate translated teacher speech. The browser never sees API keys or model paths. The Node server uploads the returned WAV files to the existing `ai-video-classrooms` storage bucket.

### Translated voice prerequisites

Set `GEMINI_API_KEY` in the app environment. No Bhashini or Bharat4U key is required for this flow. Start the local Indic-TTS service before selecting a student language:

The app accepts `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` from the same `.env` file. Vite exposes only the URL and publishable key to the browser; the service-role key and `GEMINI_API_KEY` remain server-only.

```powershell
cd services/indic-tts
$env:INDIC_TTS_MODEL_ROOT = "$PWD\models"
python app.py
```

The app calls `http://127.0.0.1:8001/health` and `http://127.0.0.1:8001/synthesize` through `INDIC_TTS_URL`. Gemini performs the transcript translation on the server; the browser receives only signed audio URLs.

Build a production-quality React + Vite web application called "Vidya A.I."



Vidya A.I. is an AI-powered multilingual learning platform for students.



IMPORTANT:

- Build the FRONTEND first.

- Keep the code modular and production-ready.

- Do not generate unnecessary documentation.

- Do not add fake AI functionality.

- Do not expose API keys.

- Use mock data where backend integration is not available.

- Use Supabase-ready architecture.

- Every button and navigation item should actually work.

- Make the UI responsive for mobile, tablet and desktop.

- Do not use lorem ipsum.



TECH STACK:

- React

- Vite

- React Router

- Tailwind CSS

- Lucide React

- Supabase-ready architecture



BRAND:

Name: Vidya A.I.

Tagline: "Learn in your language. Learn your way."



DESIGN:

Create a premium modern education platform.

Use:

- white/light background

- blue and purple primary accents

- rounded cards

- subtle shadows

- clean typography

- professional animations

- excellent mobile responsiveness



PAGES:



1. LANDING PAGE

Include:

- Vidya A.I. logo

- Hero section

- "AI-powered learning in your language"

- Explain multilingual learning

- AI tutor

- personalized learning

- progress tracking

- CTA: Start Learning

- CTA: Login

- Features section

- How it works

- Footer



2. LOGIN

Fields:

- Email

- Password

- Show/hide password

- Forgot password

- Login

- Create account



3. SIGNUP

Fields:

- Name

- Email

- Password

- Confirm password

- Create account

- Login link



4. FORGOT PASSWORD

- Email

- Send reset link

- Back to login



5. ONBOARDING



Create separate pages:



/onboarding/welcome

- Welcome to Vidya A.I.



/onboarding/class

- Ask student's class/grade

- Options for school/college levels



/onboarding/language

- Ask preferred learning language

- Include major Indian languages



/onboarding/subjects

- Allow multiple subject selection



/onboarding/preferences

- Learning goals

- Daily study time

- Difficulty preference

- Learning style



/onboarding/review

- Show all selected information

- Allow editing



/onboarding/complete

- Confirm setup

- Continue to dashboard



6. STUDENT DASHBOARD



Create a premium student dashboard containing:



- Welcome message

- Current learning streak

- Daily study goal

- Overall progress

- Continue learning

- Recommended lessons

- Subjects

- Recent activity

- Achievements

- Upcoming tasks



7. AI TUTOR



Create an AI tutor interface with:



- Chat interface

- Student messages

- AI responses

- Subject selector

- Language selector

- Ask question input

- Voice input UI

- Explain simply option

- "Explain in my language" option



Use mock AI responses for now.

Do NOT pretend a real AI API is connected.



8. SUBJECTS



Show student's selected subjects.



Each subject should have:

- progress

- completed lessons

- pending lessons

- continue button



9. LESSON PAGE



Include:

- lesson title

- explanation

- examples

- key points

- previous/next navigation

- mark as complete

- ask AI tutor



10. PROGRESS



Show:

- subject progress

- weekly study time

- streak

- completed lessons

- quiz performance

- learning activity chart



11. PROFILE / SETTINGS



Include:

- name

- email

- preferred language

- class

- subjects

- notification settings

- logout



NAVIGATION:



Desktop:

- sidebar/dashboard navigation



Mobile:

- responsive bottom navigation or mobile menu



Navigation items:

- Dashboard

- AI Tutor

- Subjects

- Progress

- Profile



ARCHITECTURE:



Create:



src/

  components/

  layouts/

  pages/

    auth/

    onboarding/

    student/

  context/

  hooks/

  services/

  data/

  utils/



Create reusable components:

- Button

- Input

- Card

- Modal

- LoadingState

- EmptyState

- ProgressBar

- SubjectCard

- LessonCard

- ChatMessage

- StatCard



Create separate mock data files.



Use React Router for all routes.



Keep authentication and database services separated so Supabase can be connected later.



IMPORTANT:

First build the complete frontend and navigation.

Do not implement real AI APIs, payment systems, or complicated backend logic yet.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3e1cf6fe-ec2d-4674-be00-85bd2f1747f3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
