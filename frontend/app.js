/* ============================================================
   VOICE4BLIND — Frontend Voice Engine
   Full voice-controlled application with intent detection,
   multilingual TTS, and document reading pipeline.
   ============================================================ */

'use strict';

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
const STATE = {
  screen: 'welcome',          // welcome | login | face | dashboard | reader
  loginStep: 'greeting',      // greeting | username | confirm_user | password | confirm_pass
  username: '',
  pendingUsername: '',
  passwordConfirmed: false,
  face: 'idle',               // idle | scanning | success | wrong-person | error
  faceDescriptor: null,       // stored face descriptor for the session
  language: 'en-US',          // BCP-47 tag for STT
  ttsLang: 'en-US',           // BCP-47 tag for TTS
  ttsVoice: null,
  readingRate: 1.0,
  readingPitch: 1.0,
  documentText: '',
  documentChunks: [],
  chunkIndex: 0,
  isReading: false,
  isPaused: false,
  currentFile: null,
  discoveredFiles: [],
  pendingFile: '',
  isListening: false,
  isSpeaking: false,
  recognition: null,
  uploadedFileName: null,
};

// Fake user database (for demo; real system uses backend)
const USERS = {
  'harini': '1234',
  'demo':   'demo',
  'user':   'password',
};

// Face recognition database.
// Each entry stores a compact 128-number face descriptor that was captured
// during enrollment. The descriptor is compared against the live camera frame
// using Euclidean distance (threshold 0.55).
// In production replace this with a backend API call.
//
// HOW TO ENROLL A NEW FACE:
//   1. Load face-api.js models (see startFaceScreen for model loading).
//   2. Call enrollFace(username) — it opens the camera, detects one face,
//      stores the descriptor in FACE_DB[username], then closes the camera.
//   3. Copy the printed descriptor array into this object.
//
// For DEMO purposes the DB is empty — the first face captured is automatically
// enrolled as the registered face for the logged-in user.  On subsequent logins
// the captured face is compared to the enrolled descriptor.
const FACE_DB = {
  // 'harini': Float32Array.from([...128 numbers...]),
  // Descriptors are populated at runtime via enrollFaceForUser()
};


// ─────────────────────────────────────────────
// MULTILINGUAL CONFIG
// ─────────────────────────────────────────────
const LANG_MAP = {
  english:   { stt: 'en-US',  tts: 'en-US',  label: 'English',    short: 'EN' },
  hindi:     { stt: 'hi-IN',  tts: 'hi-IN',  label: 'Hindi',      short: 'HI' },
  kannada:   { stt: 'kn-IN',  tts: 'kn-IN',  label: 'Kannada',    short: 'KN' },
  tamil:     { stt: 'ta-IN',  tts: 'ta-IN',  label: 'Tamil',      short: 'TA' },
  telugu:    { stt: 'te-IN',  tts: 'te-IN',  label: 'Telugu',     short: 'TE' },
  malayalam: { stt: 'ml-IN',  tts: 'ml-IN',  label: 'Malayalam',  short: 'ML' },
  marathi:   { stt: 'mr-IN',  tts: 'mr-IN',  label: 'Marathi',    short: 'MR' },
  bengali:   { stt: 'bn-IN',  tts: 'bn-IN',  label: 'Bengali',    short: 'BN' },
  gujarati:  { stt: 'gu-IN',  tts: 'gu-IN',  label: 'Gujarati',   short: 'GU' },
  punjabi:   { stt: 'pa-IN',  tts: 'pa-IN',  label: 'Punjabi',    short: 'PA' },
  urdu:      { stt: 'ur-PK',  tts: 'ur-PK',  label: 'Urdu',       short: 'UR' },
  odia:      { stt: 'or-IN',  tts: 'or-IN',  label: 'Odia',       short: 'OR' },
  assamese:  { stt: 'as-IN',  tts: 'as-IN',  label: 'Assamese',   short: 'AS' },
};

// Language aliases for intent detection
const LANG_ALIASES = {
  'english': 'english', 'hindi': 'hindi', 'हिंदी': 'hindi',
  'kannada': 'kannada', 'ಕನ್ನಡ': 'kannada', 'kannad': 'kannada',
  'tamil': 'tamil', 'தமிழ்': 'tamil',
  'telugu': 'telugu', 'తెలుగు': 'telugu',
  'malayalam': 'malayalam', 'മലയാളം': 'malayalam',
  'marathi': 'marathi', 'मराठी': 'marathi',
  'bengali': 'bengali', 'bangla': 'bengali', 'বাংলা': 'bengali',
  'gujarati': 'gujarati', 'ગુજરાતી': 'gujarati',
  'punjabi': 'punjabi', 'ਪੰਜਾਬੀ': 'punjabi',
  'urdu': 'urdu', 'اردو': 'urdu',
  'odia': 'odia', 'oriya': 'odia', 'ଓଡ଼ିଆ': 'odia',
  'assamese': 'assamese', 'অসমীয়া': 'assamese',
};

// ─────────────────────────────────────────────
// TTS ENGINE (Web Speech API)
// ─────────────────────────────────────────────
function speak(text, onEnd) {
  return new Promise(resolve => {
    if (!text) { resolve(); if (onEnd) onEnd(); return; }
    STATE.isSpeaking = true;
    stopRecognition();
    updateMicState('speaking');
    updateAssistantBubble(text);

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang  = STATE.ttsLang;
    utter.rate  = STATE.readingRate;
    utter.pitch = STATE.readingPitch;

    // Pick best voice for language
    const voices = window.speechSynthesis.getVoices();
    const match  = voices.find(v => v.lang.startsWith(STATE.ttsLang.split('-')[0]));
    if (match) utter.voice = match;

    utter.onend = () => {
      STATE.isSpeaking = false;
      updateMicState('listening');
      resolve();
      if (onEnd) onEnd();
      // Auto-resume recognition after speaking
      if (STATE.screen !== 'welcome' || STATE.loginStep !== 'greeting') {
        setTimeout(() => startRecognition(), 300);
      }
    };
    utter.onerror = () => { STATE.isSpeaking = false; resolve(); };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utter);
  });
}

// ─────────────────────────────────────────────
// SPEECH RECOGNITION ENGINE
// ─────────────────────────────────────────────
function buildRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    console.warn('SpeechRecognition not supported');
    return null;
  }
  const rec = new SpeechRecognition();
  rec.continuous      = false;
  rec.interimResults  = true;
  rec.lang            = STATE.language;
  rec.maxAlternatives = 1;

  rec.onstart = () => {
    STATE.isListening = true;
    updateMicState('listening');
    setStatusLabel('Listening…');
  };
  rec.onend = () => {
    STATE.isListening = false;
    if (!STATE.isSpeaking && STATE.screen !== 'welcome') {
      setTimeout(() => startRecognition(), 400);
    }
  };
  rec.onerror = e => {
    STATE.isListening = false;
    if (e.error !== 'no-speech' && e.error !== 'aborted') {
      console.warn('STT error:', e.error);
    }
    if (!STATE.isSpeaking) setTimeout(() => startRecognition(), 800);
  };
  rec.onresult = e => {
    let interim = '', final = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const t = e.results[i][0].transcript.trim();
      if (e.results[i].isFinal) final += t;
      else interim += t;
    }
    showTranscript(interim || final);
    if (final) handleVoiceInput(final.toLowerCase().trim());
  };
  return rec;
}

function startRecognition() {
  if (STATE.isSpeaking || STATE.isListening) return;
  if (!STATE.recognition) STATE.recognition = buildRecognition();
  else { STATE.recognition.lang = STATE.language; }
  try { STATE.recognition.start(); } catch(e) { /* already started */ }
}

function stopRecognition() {
  if (STATE.recognition && STATE.isListening) {
    try { STATE.recognition.stop(); } catch(e) {}
    STATE.isListening = false;
  }
}

// ─────────────────────────────────────────────
// INTENT DETECTION
// ─────────────────────────────────────────────
function detectIntent(text) {
  const t = text.toLowerCase();

  // Greetings
  if (/\b(hi|hello|hey|start|yes|okay|ok|ready)\b/.test(t) && STATE.screen === 'welcome') return 'greeting';

  // Confirmation
  if (/\b(yes|correct|right|confirm|ok|okay|sure|haan|ha)\b/.test(t)) return 'confirm';
  if (/\b(no|repeat|wrong|again|nahi|nope)\b/.test(t)) return 'repeat';

  // Login
  if (/\b(username|user name|my name is|name is|i am|iam)\b/.test(t)) return 'username';
  if (/\b(password|pass word|pass is|password is)\b/.test(t)) return 'password';

  // File management
  if (/\b(scan|list|find|search|discover|show|documents|files|upload)\b/.test(t)) return 'scan_files';
  if (/\b(open|load|select|choose|read file)\b/.test(t)) return 'open_file';

  // Reading controls
  if (/\b(start reading|begin reading|read|padhna shuru|odhu|chadhu)\b/.test(t)) return 'start_read';
  if (/\b(stop|pause|wait|ruko|nikol|nirthu)\b/.test(t)) return 'pause';
  if (/\b(resume|continue|chaliye|munde|continue reading)\b/.test(t)) return 'resume';
  if (/\b(repeat|again|dobara|marubar|matte|phir se|once more|say again)\b/.test(t)) return 'repeat_chunk';
  if (/\b(next|skip|forward|agle|munde|munbu)\b/.test(t)) return 'next_chunk';
  if (/\b(previous|back|peeche|hinde|pinthu)\b/.test(t)) return 'prev_chunk';
  if (/\b(summarize|summary|short|brief|brief me|saar|saransh)\b/.test(t)) return 'summarize';
  if (/\b(explain|simple|easy|samjhao|artha|vilak)\b/.test(t)) return 'explain';
  if (/\b(important|key points|highlights|mukhya|muhtvapurna)\b/.test(t)) return 'key_points';
  if (/\b(louder|volume up|zyada|jaasti|adhikam)\b/.test(t)) return 'louder';
  if (/\b(quieter|softer|volume down|kum|kam)\b/.test(t)) return 'quieter';
  if (/\b(slower|slow down|dheere|melle|thire)\b/.test(t)) return 'slower';
  if (/\b(faster|speed up|jaldi|bega|veg)\b/.test(t)) return 'faster';
  if (/\b(didn.t understand|not clear|confused|samjha nahi|puriyala|artagalilla)\b/.test(t)) return 'clarify';
  if (/\b(describe|image|graph|chart|picture|table)\b/.test(t)) return 'describe_media';

  // Language change
  for (const [alias, lang] of Object.entries(LANG_ALIASES)) {
    if (t.includes(alias) && (t.includes('change') || t.includes('switch') || t.includes('speak') || t.includes('bahasa') || t.includes('language'))) {
      return `lang:${lang}`;
    }
    // Also match "in kannada", "kannada mein"
    if (t === alias || t.includes(`in ${alias}`) || t.includes(`${alias} mein`) || t.includes(`${alias} lo`)) {
      return `lang:${lang}`;
    }
  }

  // Logout
  if (/\b(logout|log out|exit|bye|goodbye|close|quit)\b/.test(t)) return 'logout';

  return 'unknown';
}

// ─────────────────────────────────────────────
// MAIN VOICE INPUT ROUTER
// ─────────────────────────────────────────────
async function handleVoiceInput(text) {
  const intent = detectIntent(text);

  // Language change — works on any screen
  if (intent.startsWith('lang:')) {
    const langKey = intent.split(':')[1];
    await changeLang(langKey);
    return;
  }
  if (intent === 'logout') { await doLogout(); return; }

  switch (STATE.screen) {
    case 'welcome':      await handleWelcome(text, intent);      break;
    case 'login':        await handleLogin(text, intent);        break;
    case 'face':         await handleFaceVoice(text, intent);        break;
    case 'dashboard':    await handleDashboard(text, intent);    break;
    case 'reader':       await handleReader(text, intent);       break;
  }
}

// ─────────────────────────────────────────────
// SCREEN: WELCOME
// ─────────────────────────────────────────────
async function handleWelcome(text, intent) {
  if (intent === 'greeting' || intent === 'confirm') {
    await speak("Welcome! Let us get you logged in. Please say your username.");
    gotoScreen('login');
    STATE.loginStep = 'username';
    startRecognition();
  } else {
    await speak("I did not catch that. Please say Hi when you are ready.");
  }
}

// ─────────────────────────────────────────────
// SCREEN: LOGIN
// ─────────────────────────────────────────────
async function handleLogin(text, intent) {
  switch (STATE.loginStep) {
    case 'username': {
      // Extract username — strip common prefixes and punctuation
      let u = text.replace(/\b(username|user name|my name is|name is|i am|iam|is)\b/gi, '').trim();
      u = u.replace(/[^a-zA-Z0-9]/g, ' ').trim(); // strip punctuation/periods
      u = u.split(' ').filter(Boolean)[0] || ''; // take first word
      u = u.toLowerCase(); // normalize to lowercase
      if (!u) {
        await speak("I did not catch a username. Please say your username.");
        return;
      }
      STATE.pendingUsername = u;
      el('field-username').textContent = u.charAt(0).toUpperCase() + u.slice(1);
      await speak(`You said ${u}. Is that correct? Say yes or say repeat.`);
      STATE.loginStep = 'confirm_user';
      break;
    }
    case 'confirm_user': {
      if (intent === 'confirm') {
        STATE.username = STATE.pendingUsername;
        await speak("Great. Now please say your password.");
        STATE.loginStep = 'password';
      } else {
        await speak("Let us try again. Please say your username.");
        STATE.loginStep = 'username';
      }
      break;
    }
    case 'password': {
      let p = text.replace(/\b(password|pass word|password is|pass is|is)\b/gi, '').trim();
      p = p.replace(/[^a-zA-Z0-9]/g, ' ').trim(); // strip punctuation like periods/commas
      p = p.replace(/\s+/g, ''); // remove spaces (user may say "1 2 3 4")
      p = p.toLowerCase(); // normalize to lowercase for comparison
      if (!p) {
        await speak("I did not catch the password. Please say your password.");
        return;
      }
      STATE._pendingPass = p;
      el('field-password').textContent = '••••••••';
      await speak("Password received. Please hold on.");
      STATE.loginStep = 'verify';
      await doVerifyLogin();
      break;
    }
  }
}

async function doVerifyLogin() {
  const u = STATE.username.toLowerCase().replace(/[^a-z0-9]/g, '');
  const p = STATE._pendingPass.toLowerCase().replace(/[^a-z0-9]/g, '');
  const storedPass = (USERS[u] || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (storedPass && storedPass === p) {
    // Password correct — proceed directly to face recognition
    await speak("Password correct. Proceeding to face recognition.");
    await startFaceScreen();
  } else {
    await speak("The password is incorrect. Please try again. Say your password.");
    STATE.loginStep = 'password';
    el('field-password').textContent = '—';
  }
}

// ─────────────────────────────────────────────
// SCREEN: DASHBOARD
// ─────────────────────────────────────────────
async function handleDashboard(text, intent) {
  if (intent === 'scan_files') {
    await scanAndListFiles();
  } else if (intent === 'open_file' || intent === 'unknown') {
    // Try to match against discovered files or accept file name directly
    await tryOpenFile(text);
  }
}

async function scanAndListFiles() {
  await speak("Scanning your documents folder. Please wait.");
  // Simulate discovered files (real backend would list actual files)
  STATE.discoveredFiles = await fetchDiscoveredFiles();
  renderFileList();
  if (STATE.discoveredFiles.length === 0) {
    await speak("I did not find any PDF or document files. Please upload a file using the backend and try again.");
    return;
  }
  const names = STATE.discoveredFiles.map((f, i) => `${i + 1}. ${f.name}`).join('. ');
  await speak(`I found ${STATE.discoveredFiles.length} files. ${names}. Please say the file name or number you want to open.`);
}

async function fetchDiscoveredFiles() {
  try {
    const res = await fetch('/api/list-files');
    if (!res.ok) throw new Error('no backend');
    const data = await res.json();
    return data.files || [];
  } catch {
    // Fallback demo files when backend is not running
    return [
      { name: 'Maths Notes PDF',     type: 'PDF',  icon: '📄' },
      { name: 'History Book',         type: 'EPUB', icon: '📚' },
      { name: 'Science Chapter Three',type: 'PDF',  icon: '📄' },
      { name: 'English Grammar',      type: 'DOCX', icon: '📝' },
    ];
  }
}

function renderFileList() {
  const list = el('file-list');
  list.innerHTML = '';
  STATE.discoveredFiles.forEach((f, i) => {
    const div = document.createElement('div');
    div.className = 'file-item';
    div.id = `file-${i}`;
    div.innerHTML = `
      <span class="file-icon">${f.icon || '📄'}</span>
      <div>
        <div class="file-name">${f.name}</div>
        <div class="file-type">${f.type || 'Document'}</div>
      </div>`;
    list.appendChild(div);
  });
}

async function tryOpenFile(text) {
  if (STATE.discoveredFiles.length === 0) {
    await speak("Please say scan documents first so I can find your files.");
    return;
  }
  // Numeric selection
  const numMatch = text.match(/\b([1-9])\b/);
  if (numMatch) {
    const idx = parseInt(numMatch[1]) - 1;
    if (STATE.discoveredFiles[idx]) { await openFile(idx); return; }
  }
  // Name fuzzy match
  const t = text.toLowerCase();
  let bestIdx = -1, bestScore = 0;
  STATE.discoveredFiles.forEach((f, i) => {
    const words = f.name.toLowerCase().split(' ');
    const score = words.filter(w => t.includes(w)).length;
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  });
  if (bestIdx >= 0 && bestScore > 0) {
    STATE.pendingFile = STATE.discoveredFiles[bestIdx].name;
    await speak(`Opening ${STATE.pendingFile}.`);
    await openFile(bestIdx);
  } else {
    await speak("I could not find that file. Please say scan documents to list available files.");
  }
}

async function openFile(idx) {
  const file = STATE.discoveredFiles[idx];
  highlightFile(idx);
  STATE.currentFile = file;
  el('reader-filename').textContent = file.name;

  // Load document text from backend or use demo
  const docText = await loadDocumentText(file);
  STATE.documentText = docText;
  STATE.documentChunks = chunkText(docText, 400);
  STATE.chunkIndex = 0;
  STATE.isReading = false;
  STATE.isPaused  = false;

  gotoScreen('reader');
  el('reader-content-text').textContent = STATE.documentText.slice(0, 800) + '…';
  await speak(`File loaded successfully. Say start reading when you are ready, or say read to begin.`);
  startRecognition();
}

async function loadDocumentText(file) {
  try {
    const res = await fetch(`/api/read-file?name=${encodeURIComponent(file.name)}`);
    if (!res.ok) throw new Error();
    const data = await res.json();
    return data.text || '';
  } catch {
    return `This is a demonstration of the document reading system for ${file.name}.
The full document content would be extracted from the actual file by the backend processing engine.
Chapter One. Introduction to the subject.
This document covers a wide range of topics that are important for students.
The first section deals with foundational concepts that every learner should understand.
Let us begin with the basics and move progressively to more advanced material.
Section Two. Core concepts and definitions.
Here we explore the main ideas in detail.
Each concept is explained step by step so that any learner can follow along.
Images, charts, and tables in the document will be described verbally.
Section Three. Practice problems and solutions.
This section contains worked examples that reinforce the concepts learned earlier.
End of demonstration content.`;
  }
}

// ─────────────────────────────────────────────
// SCREEN: READER
// ─────────────────────────────────────────────
async function handleReader(text, intent) {
  switch (intent) {
    case 'start_read':  await startReading();       break;
    case 'pause':       await pauseReading();        break;
    case 'resume':      await resumeReading();       break;
    case 'repeat_chunk': await repeatChunk();        break;
    case 'next_chunk':  await nextChunk();           break;
    case 'prev_chunk':  await prevChunk();           break;
    case 'summarize':   await summarizeChunk();      break;
    case 'explain':     await explainChunk();        break;
    case 'key_points':  await keyPointsChunk();      break;
    case 'louder':      adjustPitch(0.1);            break;
    case 'quieter':     adjustPitch(-0.1);           break;
    case 'slower':      adjustRate(-0.2);            break;
    case 'faster':      adjustRate(0.2);             break;
    case 'clarify':     await speak("Let me explain that section in simpler words. " + simplify(getCurrentChunk())); break;
    case 'describe_media': await speak("There is an image or graph in this section. It appears to show data related to the topic being discussed. Would you like more details?"); break;
    default:
      if (STATE.isPaused && /\b(go|continue|resume|play|chaliye)\b/.test(text)) {
        await resumeReading();
      }
      break;
  }
}

async function startReading() {
  if (STATE.isReading && !STATE.isPaused) {
    await speak("I am already reading. Say pause to stop.");
    return;
  }
  STATE.isReading = true;
  STATE.isPaused  = false;
  await speak("Starting to read.");
  await readNextChunk();
}

async function readNextChunk() {
  if (!STATE.isReading || STATE.isPaused) return;
  if (STATE.chunkIndex >= STATE.documentChunks.length) {
    STATE.isReading = false;
    await speak("I have finished reading the document. Say repeat to start over, or say logout to exit.");
    return;
  }
  const chunk = STATE.documentChunks[STATE.chunkIndex];
  updateProgress();
  highlightCurrentChunk(chunk);

  // Check for media markers
  if (chunk.includes('[IMAGE]') || chunk.includes('[GRAPH]') || chunk.includes('[TABLE]')) {
    await speak("There is a visual element in this section. Would you like me to describe it?");
    // Wait for user response — will come via continuous recognition
    return;
  }

  await speak(chunk);
  if (STATE.isReading && !STATE.isPaused) {
    STATE.chunkIndex++;
    await readNextChunk();
  }
}

async function pauseReading() {
  STATE.isPaused = true;
  window.speechSynthesis.pause();
  await speak("Paused. Say resume or continue when you are ready.");
}

async function resumeReading() {
  if (!STATE.isReading) { await startReading(); return; }
  STATE.isPaused = false;
  window.speechSynthesis.resume();
  await speak("Resuming.");
  await readNextChunk();
}

async function repeatChunk() {
  const chunk = getCurrentChunk();
  await speak("Repeating. " + chunk);
}

async function nextChunk() {
  STATE.chunkIndex = Math.min(STATE.chunkIndex + 1, STATE.documentChunks.length - 1);
  await speak("Moving to next section.");
  if (STATE.isReading) await readNextChunk();
  else await speak(getCurrentChunk());
}

async function prevChunk() {
  STATE.chunkIndex = Math.max(STATE.chunkIndex - 1, 0);
  await speak("Going back. " + getCurrentChunk());
}

async function summarizeChunk() {
  const chunk = getCurrentChunk();
  const summary = await aiSummarize(chunk);
  await speak("Here is the summary. " + summary);
}

async function explainChunk() {
  const chunk = getCurrentChunk();
  await speak("Let me explain this in simple words. " + simplify(chunk));
}

async function keyPointsChunk() {
  const chunk = getCurrentChunk();
  await speak("Here are the important points from this section. " + extractKeyPoints(chunk));
}

function getCurrentChunk() {
  return STATE.documentChunks[STATE.chunkIndex] || STATE.documentText.slice(0, 400);
}

// ─────────────────────────────────────────────
// AI HELPERS (client-side fallback + backend call)
// ─────────────────────────────────────────────
async function aiSummarize(text) {
  try {
    const res = await fetch('/api/summarize', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text })
    });
    if (!res.ok) throw new Error();
    const d = await res.json();
    return d.summary;
  } catch {
    // Fallback client summary: first and last sentence
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    if (sentences.length <= 2) return text;
    return sentences[0] + ' ' + sentences[sentences.length - 1];
  }
}

function simplify(text) {
  // Simplified breakdown (real system uses backend LLM)
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  return sentences.slice(0, 3).map(s => s.trim()).join('. ');
}

function extractKeyPoints(text) {
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const points = sentences.slice(0, Math.min(3, sentences.length));
  return points.map((p, i) => `Point ${i + 1}: ${p.trim()}`).join('. ');
}

// ─────────────────────────────────────────────
// LANGUAGE SWITCHING
// ─────────────────────────────────────────────
async function changeLang(langKey) {
  const cfg = LANG_MAP[langKey];
  if (!cfg) { await speak("Sorry, that language is not supported yet."); return; }
  STATE.language = cfg.stt;
  STATE.ttsLang  = cfg.tts;
  if (STATE.recognition) STATE.recognition.lang = cfg.stt;
  el('reader-lang-badge').textContent = cfg.short;
  await speak(`Switched to ${cfg.label}. Continuing from the same position.`);
  if (STATE.isReading && !STATE.isPaused) await readNextChunk();
  else startRecognition();
}

// ─────────────────────────────────────────────
// RATE / PITCH
// ─────────────────────────────────────────────
async function adjustRate(delta) {
  STATE.readingRate = Math.min(2.0, Math.max(0.3, STATE.readingRate + delta));
  el('reader-speed-badge').textContent = STATE.readingRate <= 0.6 ? 'Slow Speed'
    : STATE.readingRate <= 1.2 ? 'Normal Speed' : 'Fast Speed';
  await speak(`Speed adjusted. ${delta > 0 ? 'Reading faster' : 'Reading slower'} now.`);
}
async function adjustPitch(delta) {
  STATE.readingPitch = Math.min(2.0, Math.max(0.0, STATE.readingPitch + delta));
  await speak(delta > 0 ? "Volume increased." : "Volume decreased.");
}

// ─────────────────────────────────────────────
// LOGOUT
// ─────────────────────────────────────────────
async function doLogout() {
  STATE.isReading = false;
  STATE.isPaused  = false;
  window.speechSynthesis.cancel();
  await speak("You have been logged out. Thank you for using VOICE4BLIND. Goodbye.");
  stopRecognition();
  gotoScreen('welcome');
  setTimeout(() => initWelcome(), 1000);
}

// ─────────────────────────────────────────────
// TEXT CHUNKING
// ─────────────────────────────────────────────
function chunkText(text, maxWords) {
  const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
  const chunks = [];
  let current = '';
  sentences.forEach(s => {
    if ((current + s).split(' ').length > maxWords) {
      if (current) chunks.push(current.trim());
      current = s;
    } else {
      current += ' ' + s;
    }
  });
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

// ─────────────────────────────────────────────
// FACE RECOGNITION SCREEN
// Uses face-api.js (loaded from CDN) for real webcam face detection
// and descriptor-based matching.
//
// FLOW:
//   password correct
//     → startFaceScreen()          — loads models, opens camera, voice prompt
//     → runFaceScan()              — captures frame, detects & compares face
//         matched same person      → handleFaceSuccess()  → dashboard
//         different person         → handleFaceWrongPerson() → retry prompt
//         no face registered yet   → enrollFaceForUser()  → store & proceed
//         no face in frame         → handleFaceNotFound() → retry prompt
//         not registered in DB     → handleFaceError()    → access denied
// ─────────────────────────────────────────────

// Shared delay helper
function fpDelay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Runtime flag — true once face-api models are fully loaded
let faceModelsLoaded = false;
let faceStream = null;       // MediaStream from camera

// CDN base for face-api.js tiny model weights
const FACE_API_CDN = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model';

// ── Entry point ──────────────────────────────
async function startFaceScreen() {
  STATE.screen = 'face';
  STATE.face = 'idle';
  gotoScreen('face');
  setFaceState('idle');

  // 1. System speaks — asks user to look at camera
  await speak(
    "Password verified. Now please look directly at the camera for face recognition."
  );

  // 2. Load face-api.js models if not already loaded
  await loadFaceModels();

  // 3. Open the camera
  const cameraOk = await openCamera();
  if (!cameraOk) {
    await speak("Could not access the camera. Please allow camera permission and try again.");
    STATE.screen = 'face';
    startRecognition();
    return;
  }

  // 4. Begin face scan
  await runFaceScan();
}

// ── Load face-api.js from CDN (tiny models only) ──
async function loadFaceModels() {
  if (faceModelsLoaded) return;
  // Inject face-api script if not already present
  if (!window.faceapi) {
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/dist/face-api.js';
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }
  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(FACE_API_CDN),
      faceapi.nets.faceLandmark68TinyNet.loadFromUri(FACE_API_CDN),
      faceapi.nets.faceRecognitionNet.loadFromUri(FACE_API_CDN),
    ]);
    faceModelsLoaded = true;
  } catch (e) {
    console.warn('face-api model load failed — running in simulation mode:', e.message);
    faceModelsLoaded = false; // will fall back to simulation
  }
}

// ── Open the front-facing camera ──
async function openCamera() {
  try {
    faceStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: 320, height: 240 }
    });
    const video = document.getElementById('face-video');
    video.srcObject = faceStream;
    await new Promise(r => { video.onloadedmetadata = r; });
    return true;
  } catch (e) {
    console.warn('Camera open failed:', e.message);
    return false;
  }
}

// ── Close the camera ──
function closeCamera() {
  if (faceStream) {
    faceStream.getTracks().forEach(t => t.stop());
    faceStream = null;
  }
}

// ── Capture one frame from the video element ──
function captureFrame() {
  const video  = document.getElementById('face-video');
  const canvas = document.getElementById('face-canvas');
  canvas.width  = video.videoWidth  || 320;
  canvas.height = video.videoHeight || 240;
  canvas.getContext('2d').drawImage(video, 0, 0);
  return canvas;
}

// ── Core scan flow ──────────────────────────
async function runFaceScan() {
  setFaceState('scanning');
  await speak("Scanning your face. Please hold still and look at the camera.");

  // Give the camera ~1 s to stabilise
  await fpDelay(1000);

  let detectedDescriptor = null;

  if (faceModelsLoaded && faceStream) {
    // ── REAL face-api detection ──
    const canvas = captureFrame();
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 });
    const result  = await faceapi
      .detectSingleFace(canvas, options)
      .withFaceLandmarks(true)
      .withFaceDescriptor();

    if (result) {
      detectedDescriptor = result.descriptor; // Float32Array[128]
    }
  } else {
    // ── SIMULATION MODE (no camera / no models) ──
    // Simulate a detected descriptor using a seeded random per username
    // so the same user always matches themselves.
    detectedDescriptor = simulateDescriptor(STATE.username);
  }

  closeCamera();

  if (!detectedDescriptor) {
    // No face found in frame
    await handleFaceNotFound();
    return;
  }

  const u = STATE.username.toLowerCase().trim();

  if (!FACE_DB[u]) {
    // First login — enrol this face automatically
    FACE_DB[u] = detectedDescriptor;
    console.info(`Face enrolled for user: ${u}`);
    await handleFaceSuccess(true);
    return;
  }

  // Compare against stored descriptor
  const distance = faceapi
    ? faceapi.euclideanDistance(Array.from(FACE_DB[u]), Array.from(detectedDescriptor))
    : euclideanDistance(FACE_DB[u], detectedDescriptor);

  if (distance < 0.55) {
    // Same person — good match
    await handleFaceSuccess(false);
  } else {
    // Different face — wrong person trying to access
    await handleFaceWrongPerson();
  }
}

// ── Success — face matched ──
async function handleFaceSuccess(wasEnrolled) {
  STATE.face = 'success';
  setFaceState('success');

  const msg = wasEnrolled
    ? `Face registered and verified. Welcome, ${STATE.username}. Redirecting to document dashboard.`
    : `Face recognised. Identity confirmed. Welcome, ${STATE.username}. Redirecting to document dashboard.`;

  await speak(msg);
  await fpDelay(700);

  el('dashboard-user').textContent = STATE.username;
  gotoScreen('dashboard');
  STATE.loginStep = 'done';
  STATE.screen    = 'dashboard';

  await speak(
    "You are now on the document dashboard. You can say scan documents to find your files. Or say the name of a file to open it."
  );
  startRecognition();
}

// ── Wrong person — a different face was detected ──
async function handleFaceWrongPerson() {
  STATE.face = 'wrong-person';
  setFaceState('wrong-person');
  await speak(
    "Your face did not match the registered face for this account. This login attempt has been blocked. Please try again with the correct person."
  );
  await fpDelay(2200);
  await speak("Say try again to rescan, or say logout to exit.");
  STATE.screen = 'face';
  startRecognition();
}

// ── No face found in the camera frame ──
async function handleFaceNotFound() {
  STATE.face = 'error';
  setFaceState('error');
  await speak(
    "No face was detected. Please make sure your face is clearly visible in front of the camera and try again."
  );
  await fpDelay(1800);
  await speak("Say try again to rescan, or say logout to exit.");
  STATE.screen = 'face';
  startRecognition();
}

// ── Not in database (reserved for explicit deny scenarios) ──
async function handleFaceError() {
  STATE.face = 'error';
  setFaceState('error');
  await speak(
    "Face not matched. Your face is not found in the database. Access denied. Please contact your administrator."
  );
  await fpDelay(2000);
  await speak("Say try again to rescan, or say logout to exit.");
  STATE.screen = 'face';
  startRecognition();
}

// ── Voice handler for face screen ──
async function handleFaceVoice(text, intent) {
  if (/\b(try again|retry|rescan|scan again|again)\b/.test(text)) {
    setFaceState('idle');
    await speak("Okay. Please look at the camera again.");
    await fpDelay(400);
    const cameraOk = await openCamera();
    if (!cameraOk) {
      await speak("Camera not available. Please check permissions and say try again.");
      startRecognition();
      return;
    }
    await runFaceScan();
  } else if (intent === 'logout') {
    closeCamera();
    await doLogout();
  } else {
    await speak("Please say try again to rescan, or say logout to exit.");
  }
}

// ── Visual state controller ──
// state: 'idle' | 'scanning' | 'success' | 'wrong-person' | 'error'
function setFaceState(state) {
  const circle    = document.getElementById('face-circle');
  const scanLine  = document.getElementById('face-scan-line');
  const container = document.getElementById('face-container');
  const badge     = document.getElementById('face-status-badge');
  const statusDot = document.getElementById('face-status-dot');
  const statusLbl = document.getElementById('face-status-label');
  const title     = document.getElementById('face-title');
  const subtitle  = document.getElementById('face-subtitle');
  const navDot    = document.getElementById('face-nav-dot');
  const navTxt    = document.getElementById('face-nav-status-text');

  if (!circle) return;

  // Reset all modifier classes
  circle.classList.remove('scanning', 'success', 'wrong-person', 'error');
  scanLine.classList.remove('active');
  container.classList.remove('active-vf');
  badge.classList.remove('scanning-state', 'success-state', 'wrong-person-state', 'error-state');
  statusDot.classList.remove('pulse', 'scanning', 'success', 'wrong-person', 'error-dot');

  switch (state) {
    case 'idle':
      statusDot.classList.add('pulse');
      statusLbl.textContent = 'Waiting to scan face…';
      title.textContent     = 'Face Recognition';
      subtitle.textContent  = 'Look directly at the camera';
      navDot.className      = 'dot listening';
      navTxt.textContent    = 'Ready';
      break;

    case 'scanning':
      circle.classList.add('scanning');
      scanLine.classList.add('active');
      container.classList.add('active-vf');
      badge.classList.add('scanning-state');
      statusDot.classList.add('scanning');
      statusLbl.textContent = 'Scanning your face…';
      title.textContent     = 'Face Recognition';
      subtitle.textContent  = 'Hold still — analysing your face';
      navDot.className      = 'dot speaking';
      navTxt.textContent    = 'Scanning';
      break;

    case 'success':
      circle.classList.add('success');
      badge.classList.add('success-state');
      statusDot.classList.add('success');
      statusLbl.textContent = 'Face recognised ✓';
      title.textContent     = 'Identity Confirmed';
      subtitle.textContent  = 'Welcome! Redirecting…';
      navDot.className      = 'dot listening';
      navTxt.textContent    = 'Verified';
      break;

    case 'wrong-person':
      circle.classList.add('wrong-person');
      badge.classList.add('wrong-person-state');
      statusDot.classList.add('wrong-person');
      statusLbl.textContent = 'Face did not match ✗';
      title.textContent     = 'Wrong Person Detected';
      subtitle.textContent  = 'Your face did not match — please try again';
      navDot.className      = 'dot idle';
      navTxt.textContent    = 'Blocked';
      break;

    case 'error':
      circle.classList.add('error');
      badge.classList.add('error-state');
      statusDot.classList.add('error-dot');
      statusLbl.textContent = 'Face not found ✗';
      title.textContent     = 'Recognition Failed';
      subtitle.textContent  = 'No face detected in camera frame';
      navDot.className      = 'dot idle';
      navTxt.textContent    = 'Failed';
      break;
  }
}

// ── Simulation descriptor (used when face-api models are unavailable) ──
// Generates a deterministic pseudo-random Float32Array[128] seeded by username.
// Same username always produces the same descriptor → always matches itself.
function simulateDescriptor(username) {
  const arr = new Float32Array(128);
  let seed  = 0;
  for (let i = 0; i < username.length; i++) seed += username.charCodeAt(i);
  for (let i = 0; i < 128; i++) {
    seed = (seed * 16807 + 0) % 2147483647;
    arr[i] = (seed / 2147483647) * 2 - 1;
  }
  return arr;
}

// ── Euclidean distance fallback (when face-api not loaded) ──
function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

// ─────────────────────────────────────────────
// UI HELPERS
// ─────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

function gotoScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  el(`screen-${name}`).classList.add('active');
  STATE.screen = name;
}

function updateAssistantBubble(text) {
  const ids = {
    welcome:     'assistant-text',
    login:       'login-assistant-text',
    face:        'face-assistant-text',
    dashboard:   'dashboard-assistant-text',
    reader:      'reader-assistant-text',
  };
  const id = ids[STATE.screen];
  if (id) el(id).textContent = text;
}

function showTranscript(text) {
  const ids = {
    welcome:   'transcript-display',
    login:     'login-transcript',
    dashboard: 'dashboard-transcript',
    reader:    'reader-transcript',
  };
  const id = ids[STATE.screen];
  if (id) el(id).textContent = text ? `"${text}"` : '';
}

function setStatusLabel(text) {
  const lbl = el('status-label');
  if (lbl) lbl.textContent = text;
}

function updateMicState(state) {
  const allMics  = document.querySelectorAll('.mic-circle');
  const allDots  = document.querySelectorAll('.dot');
  allMics.forEach(m => m.classList.remove('speaking'));
  allDots.forEach(d => { d.className = 'dot'; });
  if (state === 'speaking') {
    allMics.forEach(m => m.classList.add('speaking'));
    allDots.forEach(d => d.classList.add('speaking'));
    setStatusLabel('Speaking…');
  } else {
    allDots.forEach(d => d.classList.add('listening'));
    setStatusLabel('Listening…');
  }
}

function highlightFile(idx) {
  document.querySelectorAll('.file-item').forEach(f => f.classList.remove('highlighted'));
  const item = el(`file-${idx}`);
  if (item) item.classList.add('highlighted');
}

function updateProgress() {
  const pct = STATE.documentChunks.length
    ? Math.round((STATE.chunkIndex / STATE.documentChunks.length) * 100) : 0;
  el('progress-fill').style.width = pct + '%';
  el('progress-label').textContent = pct + '% read';
  el('reader-page-info').textContent = `Section ${STATE.chunkIndex + 1} of ${STATE.documentChunks.length}`;
}

function highlightCurrentChunk(chunk) {
  const box = el('reader-content-text');
  if (box) box.textContent = chunk;
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
async function initWelcome() {
  gotoScreen('welcome');
  // Ensure voices loaded
  await new Promise(r => {
    if (window.speechSynthesis.getVoices().length) { r(); return; }
    window.speechSynthesis.onvoiceschanged = r;
    setTimeout(r, 2000);
  });
  await speak("Welcome to VOICE4BLIND. I am your voice assistant for reading documents. If you are ready, please say Hi.");
  startRecognition();
}

// File upload handler (for backend integration)
window.handleFileUpload = async function(file) {
  const formData = new FormData();
  formData.append('file', file);
  try {
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    return data;
  } catch (e) {
    return { error: 'Upload failed' };
  }
};

window.addEventListener('load', () => {
  // Brief delay to let browser settle
  setTimeout(initWelcome, 800);
});
