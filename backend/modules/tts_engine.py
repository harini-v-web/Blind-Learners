"""
VOICE4BLIND — TTS Engine
Supports: gTTS (free), pyttsx3 (offline), Azure Neural TTS.
Falls back gracefully based on available libraries.
"""

import os
import io
import logging
import tempfile
from typing import Optional

logger = logging.getLogger("voice4blind.tts")

# Language → BCP-47 / gTTS lang code mapping
LANG_CODES = {
    "en": "en", "hi": "hi", "kn": "kn", "ta": "ta", "te": "te",
    "ml": "ml", "mr": "mr", "bn": "bn", "gu": "gu", "pa": "pa",
    "ur": "ur", "or": "or", "as": "as",
}

# ─────────────────────────────────────────────────────────────────────────────
# gTTS (Google TTS via HTTP — requires internet)
# ─────────────────────────────────────────────────────────────────────────────
try:
    from gtts import gTTS
    GTTS_AVAILABLE = True
except ImportError:
    GTTS_AVAILABLE = False
    logger.info("gTTS not installed. Install with: pip install gtts")

# ─────────────────────────────────────────────────────────────────────────────
# pyttsx3 (offline TTS)
# ─────────────────────────────────────────────────────────────────────────────
try:
    import pyttsx3
    _pyttsx3_engine = pyttsx3.init()
    PYTTSX3_AVAILABLE = True
except Exception:
    PYTTSX3_AVAILABLE = False

# ─────────────────────────────────────────────────────────────────────────────
# Azure Neural TTS
# ─────────────────────────────────────────────────────────────────────────────
AZURE_KEY    = os.environ.get("AZURE_SPEECH_KEY", "")
AZURE_REGION = os.environ.get("AZURE_SPEECH_REGION", "eastus")
AZURE_AVAILABLE = bool(AZURE_KEY)

if AZURE_AVAILABLE:
    try:
        import azure.cognitiveservices.speech as speechsdk
    except ImportError:
        AZURE_AVAILABLE = False

# Azure voice map
AZURE_VOICES = {
    "en-US": "en-US-JennyNeural",
    "hi-IN": "hi-IN-SwaraNeural",
    "kn-IN": "kn-IN-SapnaNeural",
    "ta-IN": "ta-IN-PallaviNeural",
    "te-IN": "te-IN-ShrutiNeural",
    "ml-IN": "ml-IN-SobhanaNeural",
    "mr-IN": "mr-IN-AarohiNeural",
    "bn-IN": "bn-IN-TanishaaNeural",
    "gu-IN": "gu-IN-DhwaniNeural",
    "pa-IN": "pa-IN-OjasveeNeural",
    "ur-PK": "ur-PK-UzmaNeural",
}


def synthesize(text: str, lang: str = "en", rate: float = 1.0) -> Optional[bytes]:
    """
    Convert text to speech audio bytes (MP3 or WAV).
    Returns None if synthesis is unavailable (use browser TTS).
    """
    lang_code = lang.split("-")[0].lower()

    # 1. Azure (best quality)
    if AZURE_AVAILABLE:
        audio = _azure_tts(text, lang, rate)
        if audio:
            return audio

    # 2. gTTS (good quality, requires internet)
    if GTTS_AVAILABLE:
        audio = _gtts_tts(text, LANG_CODES.get(lang_code, "en"))
        if audio:
            return audio

    # 3. pyttsx3 (offline fallback — limited language support)
    if PYTTSX3_AVAILABLE:
        return _pyttsx3_tts(text, rate)

    return None


def _gtts_tts(text: str, lang_code: str = "en") -> Optional[bytes]:
    try:
        tts = gTTS(text=text, lang=lang_code, slow=False)
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        return buf.getvalue()
    except Exception as e:
        logger.error(f"gTTS error: {e}")
        return None


def _pyttsx3_tts(text: str, rate: float = 1.0) -> Optional[bytes]:
    try:
        _pyttsx3_engine.setProperty('rate', int(150 * rate))
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
            path = f.name
        _pyttsx3_engine.save_to_file(text, path)
        _pyttsx3_engine.runAndWait()
        with open(path, "rb") as f:
            data = f.read()
        os.unlink(path)
        return data
    except Exception as e:
        logger.error(f"pyttsx3 error: {e}")
        return None


def _azure_tts(text: str, lang: str = "en-US", rate: float = 1.0) -> Optional[bytes]:
    try:
        voice = AZURE_VOICES.get(lang, AZURE_VOICES["en-US"])
        pct   = int((rate - 1) * 100)
        rate_str = f"+{pct}%" if pct >= 0 else f"{pct}%"
        ssml = f"""<speak version='1.0' xml:lang='{lang}'>
  <voice name='{voice}'>
    <prosody rate='{rate_str}'>{text}</prosody>
  </voice>
</speak>"""
        cfg     = speechsdk.SpeechConfig(subscription=AZURE_KEY, region=AZURE_REGION)
        synth   = speechsdk.SpeechSynthesizer(speech_config=cfg, audio_config=None)
        result  = synth.speak_ssml(ssml)
        if result.reason == speechsdk.ResultReason.SynthesizingAudioCompleted:
            return result.audio_data
        logger.error(f"Azure TTS reason: {result.reason}")
        return None
    except Exception as e:
        logger.error(f"Azure TTS error: {e}")
        return None
