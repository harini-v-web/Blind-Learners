# 🌸 VOICE4BLIND
**Empowering Vision Through Voice**

A fully voice-controlled AI web application for blind and visually-impaired learners.
No clicking. No typing. No visual cues required.

---

## Project Structure

```
voice4blind/
├── frontend/
│   ├── index.html          ← Full multi-screen UI (Welcome, Login, Dashboard, Reader)
│   ├── style.css           ← Dark purple/violet theme matching reference design
│   └── app.js              ← Complete voice pipeline (STT, TTS, intent detection)
│
├── backend/
│   ├── main.py             ← FastAPI server (REST + WebSocket)
│   ├── uploads/            ← Uploaded documents stored here
│   └── modules/
│       ├── intent_classifier.py    ← Pattern + regex intent detection
│       ├── tts_engine.py           ← gTTS / pyttsx3 / Azure Neural TTS
│       └── document_processor.py  ← Text extraction, chunking, summarization
│
├── requirements.txt
└── README.md
```

---

## Quick Start

### 1. Open standalone (no backend needed)

Simply open `frontend/index.html` in Chrome or Edge.
The app uses the Web Speech API (built into browser) for voice.

> Allow microphone access when prompted.

---

### 2. Full backend setup

```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start backend
cd backend
python main.py
# Server runs at: http://localhost:8000
# Frontend at:    http://localhost:8000/frontend/index.html
```

---

## Environment Variables (Optional)

```bash
# .env file in backend/
OPENAI_API_KEY=sk-...           # For GPT-4o summarization
AZURE_SPEECH_KEY=...            # For Azure Neural TTS
AZURE_SPEECH_REGION=eastus
```

---

## Voice Commands Reference

### Welcome Screen
| Say                        | Action              |
|----------------------------|---------------------|
| "Hi" / "Hello" / "Ready"   | Start login         |

### Login
| Say                            | Action                    |
|-------------------------------|---------------------------|
| "Username Harini"              | Set username              |
| "Yes" / "Correct"              | Confirm username          |
| "Repeat" / "No"                | Re-enter                  |
| "Password 1234"                | Set password              |

### Dashboard
| Say                        | Action                    |
|----------------------------|---------------------------|
| "Scan documents"           | List available files      |
| "Open Maths Notes"         | Open a file by name       |
| "Open file 2"              | Open file by number       |
| "Logout"                   | Logout                    |

### Reader
| Say                           | Action                       |
|-------------------------------|------------------------------|
| "Read" / "Start reading"      | Begin reading                |
| "Stop" / "Pause" / "Wait"     | Pause                        |
| "Resume" / "Continue"         | Resume                       |
| "Repeat" / "Say again"        | Repeat current section       |
| "Next" / "Skip"               | Next section                 |
| "Previous" / "Back"           | Previous section             |
| "Summarize"                   | Summary of current section   |
| "Explain simply"              | Simplified explanation       |
| "Important points"            | Key points                   |
| "Read slower"                 | Decrease speed               |
| "Read faster"                 | Increase speed               |
| "Speak louder"                | Increase pitch               |
| "Change to Kannada"           | Switch language & voice      |
| "Change to Hindi"             | Switch language & voice      |
| "Describe the graph"          | Describe visual element      |
| "Logout"                      | Exit and logout              |

---

## Supported Languages

| Language   | STT Code | TTS Code  |
|------------|----------|-----------|
| English    | en-US    | en-US     |
| Hindi      | hi-IN    | hi-IN     |
| Kannada    | kn-IN    | kn-IN     |
| Tamil      | ta-IN    | ta-IN     |
| Telugu     | te-IN    | te-IN     |
| Malayalam  | ml-IN    | ml-IN     |
| Marathi    | mr-IN    | mr-IN     |
| Bengali    | bn-IN    | bn-IN     |
| Gujarati   | gu-IN    | gu-IN     |
| Punjabi    | pa-IN    | pa-IN     |
| Urdu       | ur-PK    | ur-PK     |
| Odia       | or-IN    | or-IN     |
| Assamese   | as-IN    | as-IN     |

---

## Architecture

```
Always Listening Engine (Web Speech API)
        ↓
   Speech to Text
        ↓
 Language Detection
        ↓
  Intent Recognition (intent_classifier.py)
        ↓
   Action Handler (app.js / main.py)
        ↓
  Document Processor (document_processor.py)
        ↓
   AI Summarizer (OpenAI GPT-4o-mini)
        ↓
  Text to Speech (browser SpeechSynthesis / gTTS / Azure)
        ↓
 Return to Listening
```

---

## Demo Login Credentials

| Username | Password |
|----------|----------|
| harini   | 1234     |
| demo     | demo     |
| user     | password |

---

## Browser Compatibility

| Browser | Support |
|---------|---------|
| Chrome  | Full    |
| Edge    | Full    |
| Firefox | Partial (limited STT) |
| Safari  | Partial |

> Chrome on desktop gives the best voice recognition accuracy.
