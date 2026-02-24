"""
Detects user intent from transcribed speech using pattern matching
and optional embedding-based fallback.
"""

import re
from dataclasses import dataclass
from typing import Optional

@dataclass
class Intent:
    name: str
    confidence: float
    payload: Optional[dict] = None

# ─────────────────────────────────────────────
# INTENT RULES
# ─────────────────────────────────────────────
INTENT_RULES = [
    ("greeting",    [r'\b(hi|hello|hey|start|ready)\b']),
    ("confirm",     [r'\b(yes|correct|right|confirm|ok|okay|sure|haan|ha|bilkul)\b']),
    ("deny",        [r'\b(no|wrong|repeat|again|nahi|nope|incorrect)\b']),
    ("set_username",[r'\b(username|user name|my name is|name is|i am|iam)\b']),
    ("set_password",[r'\b(password|pass word|password is|pass is)\b']),
    ("scan_files",  [r'\b(scan|list|find|search|discover|show files|upload|documents|files)\b']),
    ("open_file",   [r'\b(open|load|select|choose|read file)\b']),
    ("start_read",  [r'\b(start reading|begin reading|read|padhna shuru|odhu|chadhu|start)\b']),
    ("pause",       [r'\b(stop|pause|wait|ruko|nikol|nirthu|hold on)\b']),
    ("resume",      [r'\b(resume|continue|chaliye|munde|go on|carry on)\b']),
    ("repeat",      [r'\b(repeat|again|dobara|marubar|matte|phir se|once more|say again)\b']),
    ("next",        [r'\b(next|skip|forward|agle|munde|munbu|next chapter|next section)\b']),
    ("prev",        [r'\b(previous|back|peeche|hinde|pinthu|last section)\b']),
    ("summarize",   [r'\b(summarize|summary|short|brief|saar|saransh|brief me)\b']),
    ("explain",     [r'\b(explain|simple|easy|samjhao|artha|vilak|in simple words|simple way)\b']),
    ("key_points",  [r'\b(important|key points|highlights|mukhya|muhtvapurna|main points)\b']),
    ("louder",      [r'\b(louder|volume up|zyada|jaasti|adhikam|speak louder|more volume)\b']),
    ("quieter",     [r'\b(quieter|softer|volume down|kum|kam|less volume|lower volume)\b']),
    ("slower",      [r'\b(slower|slow down|dheere|melle|thire|read slow|slowly)\b']),
    ("faster",      [r'\b(faster|speed up|jaldi|bega|veg|read fast)\b']),
    ("clarify",     [r'\b(didn.t understand|not clear|confused|samjha nahi|puriyala|artagalilla|unclear)\b']),
    ("describe",    [r'\b(describe|image|graph|chart|picture|table|diagram|figure)\b']),
    ("logout",      [r'\b(logout|log out|exit|bye|goodbye|close|quit)\b']),
]

# ─────────────────────────────────────────────
# LANGUAGE TRIGGERS
# ─────────────────────────────────────────────
LANG_PATTERNS = {
    "english":   [r'english', r'angrezi'],
    "hindi":     [r'hindi', r'हिंदी', r'hindhi'],
    "kannada":   [r'kannada', r'ಕನ್ನಡ', r'kannad'],
    "tamil":     [r'tamil', r'தமிழ்', r'tamizh'],
    "telugu":    [r'telugu', r'తెలుగు', r'telgu'],
    "malayalam": [r'malayalam', r'മലയാളം', r'malayaalam'],
    "marathi":   [r'marathi', r'मराठी', r'marati'],
    "bengali":   [r'bengali', r'bangla', r'বাংলা'],
    "gujarati":  [r'gujarati', r'ગુજરાતી', r'gujrati'],
    "punjabi":   [r'punjabi', r'ਪੰਜਾਬੀ', r'panjabi'],
    "urdu":      [r'urdu', r'اردو'],
    "odia":      [r'odia', r'oriya', r'ଓଡ଼ିଆ'],
    "assamese":  [r'assamese', r'অসমীয়া'],
}

LANG_TRIGGERS = [
    r'change', r'switch', r'speak in', r'in', r'language', r'bhasha',
    r'mein', r'lo', r'madhye', r'il'
]

# ─────────────────────────────────────────────
# CLASSIFIER
# ─────────────────────────────────────────────
def classify(text: str) -> Intent:
    """Classify the intent of a transcribed voice command."""
    t = text.lower().strip()

    # 1. Language change
    lang_intent = _detect_language_change(t)
    if lang_intent:
        return lang_intent

    # 2. Match rules
    for intent_name, patterns in INTENT_RULES:
        for pattern in patterns:
            if re.search(pattern, t):
                return Intent(name=intent_name, confidence=0.9)

    # 3. Simple fallback (Copilot skeleton)
    if re.search(r'\bhi|hello|ready\b', t):
        return Intent("greeting", 0.9)

    return Intent(name="unknown", confidence=0.0)

def _detect_language_change(text: str) -> Optional[Intent]:
    has_trigger = any(re.search(p, text) for p in LANG_TRIGGERS)
    for lang, patterns in LANG_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text):
                return Intent(name="change_language", confidence=0.95, payload={"language": lang})
    return None

# ─────────────────────────────────────────────
# EXTRACTION HELPERS
# ─────────────────────────────────────────────
def extract_username(text: str) -> str:
    t = re.sub(r'\b(username|user name|my name is|name is|i am|iam|is|my|call me)\b', '', text, flags=re.I).strip()
    words = t.split()
    return words[0] if words else t

def extract_password(text: str) -> str:
    t = re.sub(r'\b(password|pass word|password is|pass is|is|my password)\b', '', text, flags=re.I).strip()
    DIGIT_WORDS = {'zero':'0','one':'1','two':'2','three':'3','four':'4','five':'5','six':'6','seven':'7','eight':'8','nine':'9'}
    for word, digit in DIGIT_WORDS.items():
        t = re.sub(rf'\b{word}\b', digit, t)
    return t.replace(' ', '')

def extract_file_number(text: str) -> Optional[int]:
    m = re.search(r'\b([1-9])\b', text)
    if m: return int(m.group(1)) - 1
    WORD_NUMS = {'first':0,'second':1,'third':2,'fourth':3,'fifth':4}
    for word, idx in WORD_NUMS.items():
        if re.search(rf'\b{word}\b', text, re.I):
            return idx
    return None
