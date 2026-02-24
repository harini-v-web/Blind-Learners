"""
VOICE4BLIND — Document Processor
Handles text extraction, chunking, image/table detection,
and context-aware description for blind learners.
"""

import re
import pathlib
import logging
from typing import List, Optional, Tuple

logger = logging.getLogger("voice4blind.doc")

# ─────────────────────────────────────────────────────────────────────────────
# TEXT CHUNKING
# ─────────────────────────────────────────────────────────────────────────────
def chunk_text(text: str, words_per_chunk: int = 80) -> List[str]:
    """
    Split document text into speakable chunks.
    Respects sentence boundaries. Flags media placeholders.
    """
    # Split on sentence boundaries
    sentences = re.split(r'(?<=[.!?])\s+', text)
    chunks: List[str] = []
    current: List[str] = []
    word_count = 0

    for sentence in sentences:
        sentence = sentence.strip()
        if not sentence:
            continue
        # Preserve media markers as standalone chunks
        if re.match(r'\[(IMAGE|TABLE|GRAPH|FIGURE|CHART).*?\]', sentence, re.I):
            if current:
                chunks.append(' '.join(current))
                current = []
                word_count = 0
            chunks.append(sentence)
            continue
        wc = len(sentence.split())
        if word_count + wc > words_per_chunk and current:
            chunks.append(' '.join(current))
            current = [sentence]
            word_count = wc
        else:
            current.append(sentence)
            word_count += wc

    if current:
        chunks.append(' '.join(current))

    return [c for c in chunks if c.strip()]


def is_media_chunk(chunk: str) -> Tuple[bool, str]:
    """
    Detect if a chunk is a media placeholder.
    Returns (is_media, media_type).
    """
    m = re.match(r'\[(IMAGE|TABLE|GRAPH|FIGURE|CHART)(.*?)\]', chunk, re.I)
    if m:
        return True, m.group(1).capitalize()
    return False, ""


# ─────────────────────────────────────────────────────────────────────────────
# HEADING DETECTION
# ─────────────────────────────────────────────────────────────────────────────
def detect_heading(text: str) -> Optional[str]:
    """Detect if a chunk is a heading/chapter title."""
    stripped = text.strip()
    if len(stripped) < 80 and re.match(r'^(chapter|section|unit|part|lesson)\b', stripped, re.I):
        return stripped
    if re.match(r'^[0-9]+\.\s+\w', stripped) and len(stripped) < 80:
        return stripped
    return None


# ─────────────────────────────────────────────────────────────────────────────
# SIMPLE LOCAL SUMMARIZER
# ─────────────────────────────────────────────────────────────────────────────
def local_summarize(text: str, max_sentences: int = 3) -> str:
    """Extractive summary: pick most information-dense sentences."""
    sentences = re.findall(r'[^.!?\n]+[.!?\n]+', text)
    if not sentences:
        return text[:400]
    if len(sentences) <= max_sentences:
        return text

    # Score by sentence position and keyword density
    keywords = _extract_keywords(text)
    scored = []
    for i, sent in enumerate(sentences):
        pos_score  = 1.0 if i == 0 else (0.8 if i == len(sentences)-1 else 0.5)
        kw_score   = sum(1 for kw in keywords if kw in sent.lower()) / (len(keywords) + 1)
        scored.append((pos_score + kw_score, i, sent.strip()))

    scored.sort(key=lambda x: (-x[0], x[1]))
    top = sorted(scored[:max_sentences], key=lambda x: x[1])
    return ' '.join(s[2] for s in top)


def local_explain(text: str) -> str:
    """
    Simplify text: shorter sentences, remove parentheticals.
    """
    # Remove parenthetical asides
    simplified = re.sub(r'\([^)]{5,60}\)', '', text)
    # Break at semicolons
    simplified = simplified.replace(';', '.')
    # Take first 3 sentences
    sentences = re.findall(r'[^.!?\n]+[.!?\n]+', simplified)[:3]
    return ' '.join(s.strip() for s in sentences) if sentences else text[:300]


def extract_key_points(text: str, max_points: int = 4) -> str:
    """Extract bullet-point style key points from text."""
    sentences = re.findall(r'[^.!?\n]+[.!?\n]+', text)
    keywords  = _extract_keywords(text)

    scored = []
    for sent in sentences:
        score = sum(1 for kw in keywords if kw in sent.lower())
        if score > 0:
            scored.append((score, sent.strip()))

    scored.sort(reverse=True)
    points = [s[1] for s in scored[:max_points]]
    if not points:
        points = [s.strip() for s in sentences[:max_points]]

    return '. '.join(f'Point {i+1}: {p}' for i, p in enumerate(points))


def _extract_keywords(text: str, top_n: int = 10) -> List[str]:
    """Simple keyword extraction by term frequency (excluding stop words)."""
    STOP = {
        'the','a','an','is','are','was','were','be','been','being',
        'have','has','had','do','does','did','will','would','shall',
        'should','may','might','can','could','in','on','at','to',
        'for','of','and','or','but','not','with','by','from','this',
        'that','it','its','we','i','you','he','she','they','their',
    }
    words = re.findall(r'\b[a-z]{4,}\b', text.lower())
    freq  = {}
    for w in words:
        if w not in STOP:
            freq[w] = freq.get(w, 0) + 1
    sorted_kw = sorted(freq, key=freq.get, reverse=True)
    return sorted_kw[:top_n]


# ─────────────────────────────────────────────────────────────────────────────
# DESCRIPTION TEMPLATES for media
# ─────────────────────────────────────────────────────────────────────────────
MEDIA_DESCRIPTIONS = {
    "Image":  "There is an image on this page. It likely illustrates a concept discussed in this section.",
    "Table":  "There is a table here. It organizes data into rows and columns for comparison.",
    "Graph":  "There is a graph in this section. It visually represents numerical data or trends.",
    "Chart":  "There is a chart here showing statistical or comparative information.",
    "Figure": "There is a figure on this page. It may be a diagram, illustration, or labeled image.",
}

def describe_media_local(media_type: str, context: str = "") -> str:
    base = MEDIA_DESCRIPTIONS.get(media_type, "There is a visual element in this section.")
    if context:
        keywords = _extract_keywords(context, 5)
        if keywords:
            topic = ', '.join(keywords[:3])
            base += f" The visual appears to relate to: {topic}."
    return base


# ─────────────────────────────────────────────────────────────────────────────
# PROGRESS TRACKING
# ─────────────────────────────────────────────────────────────────────────────
class ReadingSession:
    def __init__(self, chunks: List[str]):
        self.chunks    = chunks
        self.index     = 0
        self.paused    = False
        self.language  = "en"
        self.rate      = 1.0
        self.pitch     = 1.0

    @property
    def current(self) -> str:
        return self.chunks[self.index] if self.index < len(self.chunks) else ""

    @property
    def progress_pct(self) -> int:
        if not self.chunks:
            return 0
        return int((self.index / len(self.chunks)) * 100)

    @property
    def is_done(self) -> bool:
        return self.index >= len(self.chunks)

    def advance(self):
        self.index = min(self.index + 1, len(self.chunks))

    def back(self):
        self.index = max(self.index - 1, 0)

    def jump_to_chapter(self, keyword: str) -> bool:
        kw = keyword.lower()
        for i, chunk in enumerate(self.chunks):
            if kw in chunk.lower() and detect_heading(chunk):
                self.index = i
                return True
        return False
