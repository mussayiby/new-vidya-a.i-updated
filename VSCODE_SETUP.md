# VIDYA A.I. setup in VS Code

## 1. Open the project

Extract the repository, open the extracted `new-vidya-a.i-updated-main` folder in VS Code, and open two integrated terminals.

## 2. Configure environment variables

Create `.env` beside `package.json` by copying `.env.example`. Add rotated credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-key
INDIC_TTS_URL=http://127.0.0.1:8001
```

`SUPABASE_PROJECT_ID`, `SUPABASE_ANON_KEY`, and duplicate `VITE_*` variables are optional. The Vite configuration exposes only the Supabase URL and publishable key to the browser. It never exposes the service-role or Gemini key.

## 3. Install JavaScript dependencies

In the project terminal:

```powershell
npm install
```

## 4. Apply Supabase migrations

Install and authenticate the Supabase CLI, then run:

```powershell
npx supabase link --project-ref your-project-id
npx supabase db push
```

The voice migration creates the translated-voice cache tables and adds the classroom transcript column. If the CLI is unavailable, apply the files in `supabase/migrations` through the Supabase SQL editor in filename order.

## 5. Start Indic-TTS

Indic-TTS requires Python 3.10, its dependencies, and the official model checkpoints. Follow `services/indic-tts/README.md`; model weights are intentionally not included in this archive.

In the second VS Code terminal:

```powershell
cd services/indic-tts
$env:INDIC_TTS_MODEL_ROOT = "$PWD\models"
$env:INDIC_TTS_USE_CUDA = "0"
python app.py
```

Verify the service:

```powershell
Invoke-RestMethod http://127.0.0.1:8001/health
```

Expected response:

```json
{"status":"ok","provider":"ai4bharat-indic-tts-v1"}
```

## 6. Start VIDYA A.I.

In the project terminal:

```powershell
npm run dev
```

Open the URL shown by Vite, normally `http://localhost:8080`.

## 7. Test the translated classroom flow

1. Sign in and create a classroom with teacher language `English`.
2. Upload an English teaching video.
3. Run Gemini lesson analysis and publish the classroom.
4. Open the classroom as a student.
5. Select `Hindi` under `Teacher voice`.
6. Gemini translates the timestamped transcript into Hindi.
7. Indic-TTS generates Hindi WAV segments.
8. The original video audio is muted, translated audio is preloaded, and Web Audio schedules the Hindi segments against the video timeline.

## 8. Validate the project

```powershell
npm run lint
npm run build
```

Do not commit `.env`, API keys, service-role keys, model weights, `node_modules`, or generated audio files.
