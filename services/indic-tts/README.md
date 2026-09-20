# AI4Bharat Indic-TTS service

This is the local TTS boundary used by VIDYA AI Video Classroom. It wraps the official AI4Bharat Indic-TTS v1 FastPitch + HiFi-GAN checkpoints through the inference API documented by AI4Bharat. It is not a hosted API and does not use an API key.

Official sources:

- Repository: https://github.com/AI4Bharat/Indic-TTS
- v1 checkpoints: https://github.com/AI4Bharat/Indic-TTS/releases/tag/v1-checkpoints-release
- Code license: MIT (`LICENSE.txt` in the official repository)

## Supported classroom voice languages

The current VIDYA integration enables only languages with a configured v1 checkpoint and UI mapping:

| VIDYA code | Indic-TTS checkpoint archive | Required directory |
| --- | --- | --- |
| `bn` | `bn.zip` | `models/bn/` |
| `gu` | `gu.zip` | `models/gu/` |
| `hi` | `hi.zip` | `models/hi/` |
| `kn` | `kn.zip` | `models/kn/` |
| `ml` | `ml.zip` | `models/ml/` |
| `mr` | `mr.zip` | `models/mr/` |
| `ta` | `ta.zip` | `models/ta/` |
| `te` | `te.zip` | `models/te/` |

Urdu is intentionally not enabled: it is present in the VIDYA language catalog but is not in the official Indic-TTS v1 language release. The official release also includes Assamese, Bodo, Manipuri, Odia, and Rajasthani; they are not enabled here because the current VIDYA classroom selector does not expose those model mappings.

Each extracted language directory must contain:

```text
models/<language>/
  config.json
  fastpitch/best_model.pth
  hifigan/config.json
  hifigan/best_model.pth
```

The archives are approximately 1.4 GB each. Download them explicitly; this project never downloads model weights during `npm install` or at runtime.

## Windows setup

The official project is an older research stack. Use an isolated Python 3.10 environment; do not install these packages into the VIDYA Node environment. A CUDA GPU is strongly recommended. CPU inference may work with matching CPU PyTorch wheels but is slow and memory intensive.

From PowerShell:

```powershell
cd services/indic-tts
python --version
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
```

Install a PyTorch build compatible with the machine first. For example, use the official PyTorch selector for a CPU build, or the CUDA build matching the installed NVIDIA driver. The Indic-TTS README documents a CUDA 11.3-era example:

```powershell
python -m pip install torch==1.12.1+cu113 torchaudio==0.12.1+cu113 --extra-index-url https://download.pytorch.org/whl/cu113
```

On Windows, install **Visual Studio Build Tools 2022** before installing the
custom TTS fork. Select the **Desktop development with C++** workload, including
MSVC v143 and a Windows 10/11 SDK. The fork compiles its official
`TTS.tts.utils.monotonic_align.core` Cython extension during installation. A
missing `cl.exe` produces `Microsoft Visual C++ 14.0 or greater is required`.
After installing Build Tools, open a new PowerShell window and confirm:

```powershell
where.exe cl
```

Then install the service dependencies:

```powershell
python -m pip install -r requirements.txt
python -m pip install --no-deps git+https://github.com/gokulkarthik/TTS.git
```

The custom Coqui fork is installed separately with pip's `--no-deps` option. Its upstream `requirements.txt` includes training and
notebook packages that are not used by this service, including
`pyworld==0.2.10`, which fails during Python 3.10 metadata preparation. The
runtime dependencies needed by `TTS.utils.synthesizer.Synthesizer` are pinned
explicitly instead. NumPy 1.23.5 is used because it stays compatible with the
legacy `librosa==0.8.0` code while avoiding the NumPy ABI warning observed with
the older upstream pin under PyTorch 1.13. `numba==0.57.1` is paired with that
NumPy version; the upstream `numba==0.55.1` pin requires NumPy below 1.22.
`pyworld==0.3.5` is required at runtime by `TTS.utils.audio` and is selected
because PyPI provides a prebuilt CPython 3.10 Windows wheel for it. It exposes
the `dio` and `stonemask` APIs used by this fork. Do not add `umap-learn` or the training-only
packages unless you are working on upstream model training. `matplotlib` is
included because the fork imports it from its vocoder utility module during
normal `TTS.utils.synthesizer` import.

If the custom TTS fork still cannot install with these pins, stop and use the
compatibility versions required by that upstream package. Do not substitute
browser speech or a different hosted provider.

Download the required checkpoint ZIP files from the official v1 release, extract them into `services/indic-tts/models/<language>/`, and verify the directory layout above.

## Start the service

```powershell
$env:INDIC_TTS_MODEL_ROOT = "$PWD\models"
$env:INDIC_TTS_USE_CUDA = "0" # set to 1 only after verifying CUDA works
python app.py
```

The service listens only on `127.0.0.1:8001` by default. Models are loaded lazily on first use and retained in memory per language. Set `INDIC_TTS_HOST` or `INDIC_TTS_PORT` only when the local deployment requires it.

Test health:

```powershell
Invoke-RestMethod http://127.0.0.1:8001/health
```

Test real Hindi WAV generation:

```powershell
$body = @{ text = "नमस्ते बच्चों, आज हम पौधों के बारे में सीखेंगे।"; language = "hi" } | ConvertTo-Json
Invoke-WebRequest http://127.0.0.1:8001/synthesize -Method Post -ContentType "application/json" -Body $body -OutFile .\hindi-test.wav
```

Test Kannada:

```powershell
$body = @{ text = "ಇಂದು ನಾವು ಸಸ್ಯಗಳ ಬಗ್ಗೆ ಕಲಿಯುತ್ತೇವೆ."; language = "kn" } | ConvertTo-Json
Invoke-WebRequest http://127.0.0.1:8001/synthesize -Method Post -ContentType "application/json" -Body $body -OutFile .\kannada-test.wav
```

The output must be a playable, non-empty PCM WAV. These commands are tests only; generated test files should not be committed.

## Connect VIDYA

In the VIDYA project `.env` file, set:

```text
INDIC_TTS_URL=http://127.0.0.1:8001
```

No `AI4BHARAT_API_KEY` is used. Restart the VIDYA server after changing `.env`:

```powershell
cd ..\..
npm run dev
```

The Node server calls the internal service, uploads returned WAV bytes into the existing `ai-video-classrooms` bucket, and writes the existing translation-segment cache rows. The browser never sees the model path or service credentials.

## Troubleshooting

- `model is missing`: check the extracted language directory and both FastPitch/HiFi-GAN checkpoint files.
- `service unavailable`: start `python app.py` and verify `INDIC_TTS_URL`.
- `synthesis failed`: inspect the Python service console; verify the legacy Coqui fork and PyTorch versions are compatible.
- slow CPU output: use a CUDA-compatible PyTorch build and set `INDIC_TTS_USE_CUDA=1` only after testing it independently.
- unsupported language: keep the original teacher audio; add a language only after its official v1 checkpoint is installed and tested.

The AI4Bharat repository code is MIT licensed. Review the license/terms bundled with each downloaded checkpoint release before redistribution or commercial deployment.
