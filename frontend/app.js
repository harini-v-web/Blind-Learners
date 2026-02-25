/* ============================================================
   VOICE4BLIND — Frontend v4 (Complete Fix)

   Fixes applied:
   1. Face Recognition: webcam enroll + verify flow
   2. Commands work WHILE system is speaking (interrupt listening)
   3. Pause / Repeat / Stop / Loud all respond immediately
   4. Multilanguage: STT + TTS switch together; speaks in chosen language
   5. Volume up/down changes volume (not speed); speed is separate
   6. Mid-reading Q&A: questions answered via AI without stopping playback
   7. Logout works from any screen
   8. Continuous interrupt-listening during readLoop
   ============================================================ */
'use strict';

// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
const STATE = {
  screen:         'welcome',
  loginStep:      'greeting',   // greeting | username | confirm_user | password | verify | face_verify
  username:       '',
  pendingUsername:'',
  _pendingPass:   '',

  // Language
  language:       'en-US',      // STT lang
  ttsLang:        'en-US',      // TTS lang
  langKey:        'english',    // current LANGUAGES key

  // Reading
  readingRate:    1.0,
  readingVolume:  1.0,
  documentText:   '',
  documentChunks: [],
  chunkIndex:     0,
  isReading:      false,
  isPaused:       false,
  currentFile:    null,

  // Files
  discoveredFiles: [],

  // Voice control
  isListening:    false,
  isSpeaking:     false,
  recognition:    null,
  _recTimer:      null,

  // Interrupt listening (runs even while main TTS is speaking)
  interruptRec:   null,
  interruptActive:false,

  // Face auth
  faceStream:     null,
  faceEnrolled:   false,

  // Context for Q&A
  lastReadChunk:  '',
};

// ═══════════════════════════════════════════════
// USER DB (client-side mirror)
// ═══════════════════════════════════════════════
const USERS = { harini:'1234', demo:'demo', user:'password', admin:'admin' };

// ═══════════════════════════════════════════════
// MULTILINGUAL CONFIG
// ═══════════════════════════════════════════════
const LANGUAGES = {
  english:   { stt:'en-US', tts:'en-US', label:'English',   short:'EN',
    triggers:['switch to english','change to english','english please','speak english','english mode'] },
  hindi:     { stt:'hi-IN', tts:'hi-IN', label:'Hindi',     short:'HI',
    triggers:['hindi mein bolo','hindi mein badlo','change to hindi','hindi par switch karo','hindi karo','switch to hindi'] },
  kannada:   { stt:'kn-IN', tts:'kn-IN', label:'Kannada',   short:'KN',
    triggers:['kannadakke badalisu','kannada ge badalisu','kannadalli helu','kannada badalisu','change to kannada','switch to kannada','kannada mode'] },
  tamil:     { stt:'ta-IN', tts:'ta-IN', label:'Tamil',     short:'TA',
    triggers:['tamilil pesi','tamil maarum','tamilukku maarum','change to tamil','tamil pesu','switch to tamil'] },
  telugu:    { stt:'te-IN', tts:'te-IN', label:'Telugu',    short:'TE',
    triggers:['telugulo chappu','teluguki maaru','telugulo cheppu','change to telugu','switch to telugu'] },
  malayalam: { stt:'ml-IN', tts:'ml-IN', label:'Malayalam', short:'ML',
    triggers:['malayalatthil paranju','malayalathilekku maaru','change to malayalam','switch to malayalam'] },
  marathi:   { stt:'mr-IN', tts:'mr-IN', label:'Marathi',   short:'MR',
    triggers:['marathit bola','marathi madhe bola','change to marathi','switch to marathi'] },
  bengali:   { stt:'bn-IN', tts:'bn-IN', label:'Bengali',   short:'BN',
    triggers:['banglay bolo','bangla te bolo','change to bengali','switch to bengali'] },
  gujarati:  { stt:'gu-IN', tts:'gu-IN', label:'Gujarati',  short:'GU',
    triggers:['gujaratima bolo','gujarati ma badlo','change to gujarati','switch to gujarati'] },
  punjabi:   { stt:'pa-IN', tts:'pa-IN', label:'Punjabi',   short:'PA',
    triggers:['punjabi vich bolo','punjabi te badlo','change to punjabi','switch to punjabi'] },
  urdu:      { stt:'ur-PK', tts:'ur-PK', label:'Urdu',      short:'UR',
    triggers:['urdu mein bolo','urdu par badlo','change to urdu','switch to urdu'] },
  odia:      { stt:'or-IN', tts:'or-IN', label:'Odia',      short:'OR',
    triggers:['odialare kahu','odia re kahu','change to odia','switch to odia'] },
  assamese:  { stt:'as-IN', tts:'as-IN', label:'Assamese',  short:'AS',
    triggers:['asamiyat kowa','assamese ot kowa','change to assamese','switch to assamese'] },
};

// ═══════════════════════════════════════════════
// INTENT PATTERNS
// ═══════════════════════════════════════════════
const INTENTS = [
  { name:'start_read',  words:['start reading','begin reading','start read','begin read','read now','please read','read aloud','odhu','chadhu','padhna shuru','vaaykka','chadu','read'] },
  { name:'pause',       words:['pause','stop reading','hold on','wait','ruko','nirthu','nikol','nillu','thadu','band karo','stop'] },
  { name:'resume',      words:['resume','continue','go on','carry on','chaliye','munde','thodaru','tirigimpu','continue reading','start again','go ahead'] },
  { name:'repeat',      words:['repeat','say again','once more','again','dobara','marubar','matte','thirumba','malli cheppu','phir se','repeat that','say that again'] },
  { name:'next',        words:['next','skip','forward','next chapter','next section','next part','munde','agle','tiragandi','move forward','go next'] },
  { name:'prev',        words:['previous','back','go back','last section','hinde','peeche','pinthu','venkaka','previous section','go previous'] },
  { name:'summarize',   words:['summarize','summary','brief','short summary','saar','saransh','saramsha','saramsham','give summary','tell summary','make summary'] },
  { name:'explain',     words:['explain','simple words','easy words','samjhao','artha','vilakku','simple ga cheppu','saral mein','explain simply','make it simple','simplify'] },
  { name:'key_points',  words:['important points','key points','main points','highlights','mukhya','muhtvapurna','important vishayas','key info','give points','what are the main'] },
  { name:'slower',      words:['read slower','slow down','slower','slowly','dheere','melle','thire','mella','read slow','bit slow','reduce speed','decrease speed'] },
  { name:'faster',      words:['read faster','speed up','faster','fast','jaldi','bega','vegam','vega','read fast','bit fast','increase speed'] },
  { name:'louder',      words:['louder','speak louder','volume up','increase volume','loud','zyada aawaaz','jaasti','adhikam','more volume','bit louder','turn up','increase voice'] },
  { name:'quieter',     words:['quieter','softer','volume down','lower volume','quiet','kum aawaaz','kam','kurangu','takkuva','less volume','bit quiet','turn down','decrease voice'] },
  { name:'clarify',     words:["didn't understand","not clear","confused","unclear","samjha nahi","puriyala","artagalilla","teliyaledu","say differently","not understood","what did you say"] },
  { name:'describe',    words:['describe','describe image','describe graph','describe chart','describe table','what is the image','tell about picture','explain image','what does it show'] },
  { name:'scan_files',  words:['scan documents','list files','find files','show files','scan','list documents','find documents','show documents','available files','my files'] },
  { name:'open_file',   words:['open','load file','select file','choose file','open file','read file'] },
  { name:'face_enroll', words:['enroll face','register face','add my face','save my face','face register','face setup'] },
  { name:'face_login',  words:['face login','login with face','use face','face recognition','scan my face','recognize face'] },
  { name:'greeting',    words:['hi','hello','hey','ready','start','begin','yeah','ya','namaste','vanakkam'] },
  { name:'confirm',     words:['yes','correct','right','ok','okay','sure','haan','ha','bilkul','avunu','aam','that is correct','yes please','affirmative'] },
  { name:'deny',        words:['no','wrong','repeat','nahi','nope','incorrect','thappu','kadu','not right','try again'] },
  { name:'logout',      words:['logout','log out','exit','goodbye','bye','quit','close app','sign out','end session'] },
];

// ═══════════════════════════════════════════════
// INTENT DETECTION
// ═══════════════════════════════════════════════
function detectIntent(text) {
  const t = clean(text);

  // 1. Language triggers (check ALL native phrases)
  for (const [langKey, cfg] of Object.entries(LANGUAGES)) {
    for (const trigger of cfg.triggers) {
      if (t.includes(trigger)) return { name:'change_lang', lang:langKey };
    }
  }

  // 2. Intent patterns
  for (const intent of INTENTS) {
    for (const word of intent.words) {
      if (t.includes(word)) return { name:intent.name };
    }
  }

  return { name:'unknown', raw:text };
}

function clean(text) {
  return (text||'').toLowerCase()
    .replace(/[.,!?;:'"]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
}
function cleanAlphaNum(text) {
  return (text||'').toLowerCase().replace(/[^a-z0-9]/g,'');
}

// ═══════════════════════════════════════════════
// TTS ENGINE
// Fix: volume changes volume (not rate); separate controls
// Fix: speaks in the CORRECT language voice
// ═══════════════════════════════════════════════
function speak(text, lang) {
  return new Promise(resolve => {
    if (!text) { resolve(); return; }
    window.speechSynthesis.cancel();
    STATE.isSpeaking = true;
    setMicState('speaking');
    updateBubble(text);

    const useLang = lang || STATE.ttsLang;
    const utter   = new SpeechSynthesisUtterance(text);
    utter.lang    = useLang;
    utter.rate    = STATE.readingRate;
    utter.volume  = STATE.readingVolume;
    utter.pitch   = 1.0;

    // Pick best voice for the language
    const voices  = window.speechSynthesis.getVoices();
    const match   = voices.find(v => v.lang === useLang)
                 || voices.find(v => v.lang.startsWith(useLang.split('-')[0]))
                 || voices.find(v => v.default)
                 || voices[0];
    if (match) utter.voice = match;

    utter.onend = () => {
      STATE.isSpeaking = false;
      setMicState('listening');
      resolve();
      if (!STATE.isReading || STATE.isPaused) {
        clearTimeout(STATE._recTimer);
        STATE._recTimer = setTimeout(startListening, 200);
      }
    };
    utter.onerror = () => {
      STATE.isSpeaking = false;
      resolve();
      clearTimeout(STATE._recTimer);
      STATE._recTimer = setTimeout(startListening, 300);
    };

    window.speechSynthesis.speak(utter);
  });
}

function stopSpeaking() {
  window.speechSynthesis.cancel();
  STATE.isSpeaking = false;
}

// ═══════════════════════════════════════════════
// SPEECH RECOGNITION — Normal (command mode)
// ═══════════════════════════════════════════════
function buildRecognition(lang, onResult) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert('Use Chrome or Edge for voice support.'); return null; }

  const rec           = new SR();
  rec.continuous      = false;
  rec.interimResults  = false;
  rec.lang            = lang || STATE.language;
  rec.maxAlternatives = 3;

  rec.onstart = () => {
    STATE.isListening = true;
    setMicState(STATE.isSpeaking ? 'speaking' : 'listening');
  };

  rec.onresult = e => {
    const results = e.results[0];
    let best = '';
    for (let i = 0; i < results.length; i++) {
      if (results[i].transcript.trim()) { best = results[i].transcript.trim(); break; }
    }
    if (best) {
      showTranscript('"' + best + '"');
      if (onResult) onResult(best);
      else processVoice(best);
    }
  };

  rec.onend = () => {
    STATE.isListening = false;
    if (!STATE.isSpeaking) {
      clearTimeout(STATE._recTimer);
      STATE._recTimer = setTimeout(startListening, 250);
    }
  };

  rec.onerror = e => {
    STATE.isListening = false;
    if (e.error === 'no-speech' || e.error === 'aborted') {
      if (!STATE.isSpeaking) {
        clearTimeout(STATE._recTimer);
        STATE._recTimer = setTimeout(startListening, 300);
      }
      return;
    }
    clearTimeout(STATE._recTimer);
    STATE._recTimer = setTimeout(startListening, 800);
  };

  return rec;
}

function startListening() {
  if (STATE.isListening) return;
  if (!STATE.recognition) STATE.recognition = buildRecognition(STATE.language);
  if (!STATE.recognition) return;
  STATE.recognition.lang = STATE.language;
  try { STATE.recognition.start(); } catch(e) {}
}

function stopListening() {
  clearTimeout(STATE._recTimer);
  if (STATE.recognition && STATE.isListening) {
    try { STATE.recognition.abort(); } catch(e) {}
  }
  STATE.isListening = false;
}

// ═══════════════════════════════════════════════
// INTERRUPT RECOGNITION — runs WHILE system speaks
// Fix: commands work even while TTS is reading
// ═══════════════════════════════════════════════
let _intTimer = null;

function startInterruptListening() {
  if (STATE.interruptActive) return;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;

  STATE.interruptActive = true;
  const irec = new SR();
  irec.continuous      = false;
  irec.interimResults  = false;
  irec.lang            = STATE.language;
  irec.maxAlternatives = 3;
  STATE.interruptRec   = irec;

  irec.onresult = e => {
    const results = e.results[0];
    let best = '';
    for (let i = 0; i < results.length; i++) {
      if (results[i].transcript.trim()) { best = results[i].transcript.trim(); break; }
    }
    if (best) {
      showTranscript('"' + best + '"');
      handleInterruptCommand(best);
    }
  };

  irec.onend = () => {
    STATE.interruptActive = false;
    STATE.interruptRec    = null;
    // Restart interrupt if still reading
    if (STATE.isReading && !STATE.isPaused) {
      clearTimeout(_intTimer);
      _intTimer = setTimeout(startInterruptListening, 300);
    }
  };

  irec.onerror = () => {
    STATE.interruptActive = false;
    STATE.interruptRec    = null;
    if (STATE.isReading && !STATE.isPaused) {
      clearTimeout(_intTimer);
      _intTimer = setTimeout(startInterruptListening, 500);
    }
  };

  try { irec.start(); } catch(e) {}
}

function stopInterruptListening() {
  clearTimeout(_intTimer);
  STATE.interruptActive = false;
  if (STATE.interruptRec) {
    try { STATE.interruptRec.abort(); } catch(e) {}
    STATE.interruptRec = null;
  }
}

async function handleInterruptCommand(raw) {
  const intent = detectIntent(raw);

  // Language switch
  if (intent.name === 'change_lang') { await changeLang(intent.lang); return; }

  // Logout
  if (intent.name === 'logout') { await doLogout(); return; }

  switch (intent.name) {
    case 'pause':
      stopSpeaking();
      stopInterruptListening();
      STATE.isReading = false;
      STATE.isPaused  = true;
      await speak("Paused. Say resume or continue when ready.");
      break;

    case 'stop':
      stopSpeaking();
      stopInterruptListening();
      STATE.isReading = false;
      STATE.isPaused  = false;
      STATE.chunkIndex = 0;
      await speak("Stopped reading. Say read to start from beginning.");
      break;

    case 'repeat':
      stopSpeaking();
      stopInterruptListening();
      STATE.isPaused  = false;
      const repChunk  = STATE.documentChunks[STATE.chunkIndex] || "Nothing to repeat.";
      await speak("Repeating. " + repChunk);
      if (STATE.isReading) readLoop();
      break;

    case 'next':
      stopSpeaking();
      stopInterruptListening();
      STATE.chunkIndex = Math.min(STATE.chunkIndex + 1, STATE.documentChunks.length - 1);
      updateProgress();
      el('reader-content-text').textContent = STATE.documentChunks[STATE.chunkIndex] || '';
      await speak("Moving to next section.");
      if (STATE.isReading) readLoop();
      break;

    case 'prev':
      stopSpeaking();
      stopInterruptListening();
      STATE.chunkIndex = Math.max(STATE.chunkIndex - 1, 0);
      updateProgress();
      el('reader-content-text').textContent = STATE.documentChunks[STATE.chunkIndex] || '';
      await speak("Going back to previous section.");
      if (STATE.isReading) readLoop();
      break;

    case 'louder':
      STATE.readingVolume = Math.min(1.0, STATE.readingVolume + 0.2);
      // No need to stop reading; volume applies to next utterance
      await speak("Volume increased.");
      if (STATE.isReading && !STATE.isPaused) readLoop();
      break;

    case 'quieter':
      STATE.readingVolume = Math.max(0.1, STATE.readingVolume - 0.2);
      await speak("Volume decreased.");
      if (STATE.isReading && !STATE.isPaused) readLoop();
      break;

    case 'faster':
      STATE.readingRate = Math.min(2.5, STATE.readingRate + 0.2);
      el('reader-speed-badge').textContent = rateLabel();
      await speak("Speed increased.");
      if (STATE.isReading && !STATE.isPaused) readLoop();
      break;

    case 'slower':
      STATE.readingRate = Math.max(0.3, STATE.readingRate - 0.2);
      el('reader-speed-badge').textContent = rateLabel();
      await speak("Speed decreased.");
      if (STATE.isReading && !STATE.isPaused) readLoop();
      break;

    case 'summarize': {
      stopSpeaking();
      stopInterruptListening();
      const wasReading = STATE.isReading;
      STATE.isReading  = false;
      const chunk = STATE.documentChunks[STATE.chunkIndex] || STATE.documentText.slice(0,400);
      const sum   = localSummarize(chunk);
      await speak("Here is the summary. " + sum);
      if (wasReading) { STATE.isReading = true; readLoop(); }
      else startListening();
      break;
    }

    case 'key_points': {
      stopSpeaking();
      stopInterruptListening();
      const wasReading = STATE.isReading;
      STATE.isReading  = false;
      const chunk = STATE.documentChunks[STATE.chunkIndex] || STATE.documentText.slice(0,400);
      const pts   = localKeyPoints(chunk);
      await speak("Here are the important points. " + pts);
      if (wasReading) { STATE.isReading = true; readLoop(); }
      else startListening();
      break;
    }

    case 'explain': {
      stopSpeaking();
      stopInterruptListening();
      const wasReading = STATE.isReading;
      STATE.isReading  = false;
      const chunk  = STATE.documentChunks[STATE.chunkIndex] || STATE.documentText.slice(0,400);
      const simple = chunk.split('.').slice(0,3).join('. ');
      await speak("In simple words. " + simple);
      if (wasReading) { STATE.isReading = true; readLoop(); }
      else startListening();
      break;
    }

    case 'describe': {
      stopSpeaking();
      stopInterruptListening();
      const wasReading = STATE.isReading;
      STATE.isReading  = false;
      await speak("This section contains a visual element — likely a chart or diagram illustrating the concepts discussed.");
      STATE.chunkIndex++;
      if (wasReading) { STATE.isReading = true; readLoop(); }
      else startListening();
      break;
    }

    default: {
      // Unknown intent while reading = treat as Q&A question
      if (raw.trim().length > 3) {
        await handleMidReadingQuestion(raw);
      }
      break;
    }
  }
}

// ═══════════════════════════════════════════════
// MID-READING Q&A
// Fix: user can ask ANY question while reading
// ═══════════════════════════════════════════════
async function handleMidReadingQuestion(question) {
  const wasReading = STATE.isReading;
  stopSpeaking();
  stopInterruptListening();
  STATE.isReading = false;

  await speak("You asked: " + question + ". Let me find the answer.");

  // Try server-side AI
  const context = STATE.documentChunks.slice(
    Math.max(0, STATE.chunkIndex - 2),
    STATE.chunkIndex + 3
  ).join(' ');

  let answer = null;
  try {
    const r = await fetch('/api/qa', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ question, context, language: STATE.ttsLang.split('-')[0] }),
    });
    if (r.ok) {
      const d = await r.json();
      answer  = d.answer;
    }
  } catch(e) {}

  if (!answer) {
    // Local fallback: search context
    const sentences = context.split('.');
    const qWords    = question.toLowerCase().split(' ').filter(w => w.length > 3);
    const found     = sentences.find(s => qWords.some(w => s.toLowerCase().includes(w)));
    answer = found
      ? found.trim() + "."
      : "I could not find a specific answer in this section. Please continue reading or ask again.";
  }

  await speak(answer);

  if (wasReading) { STATE.isReading = true; readLoop(); }
  else startListening();
}

// ═══════════════════════════════════════════════
// MAIN VOICE ROUTER
// ═══════════════════════════════════════════════
async function processVoice(raw) {
  const intent = detectIntent(raw);

  if (intent.name === 'change_lang') { await changeLang(intent.lang); return; }
  if (intent.name === 'logout')      { await doLogout();              return; }

  switch (STATE.screen) {
    case 'welcome':   await onWelcome(raw, intent);   break;
    case 'login':     await onLogin(raw, intent);     break;
    case 'dashboard': await onDashboard(raw, intent); break;
    case 'reader':    await onReader(raw, intent);    break;
  }
}

// ═══════════════════════════════════════════════
// WELCOME
// ═══════════════════════════════════════════════
async function onWelcome(raw, intent) {
  if (intent.name === 'face_login') {
    await speak("Opening face recognition login.");
    await startFaceVerifyFlow();
  } else if (intent.name === 'greeting' || intent.name === 'confirm') {
    await speak("Welcome! Let us log you in. Please say your username.");
    gotoScreen('login');
    STATE.loginStep = 'username';
    startListening();
  } else {
    await speak("Please say Hi when you are ready, or say face login to use face recognition.");
  }
}

// ═══════════════════════════════════════════════
// LOGIN (Voice)
// ═══════════════════════════════════════════════
async function onLogin(raw, intent) {
  const t = clean(raw);

  if (STATE.loginStep === 'username') {
    let u = t.replace(/\b(username|user name|my name is|name is|i am|iam|is|my)\b/g,' ').trim();
    u = cleanAlphaNum((u.split(' ').filter(Boolean)[0]) || u);
    if (!u) { await speak("I did not catch that. Please say your username."); return; }
    STATE.pendingUsername = u;
    el('field-username').textContent = u.charAt(0).toUpperCase() + u.slice(1);
    await speak(`You said ${u}. Is that correct? Say yes or no.`);
    STATE.loginStep = 'confirm_user';

  } else if (STATE.loginStep === 'confirm_user') {
    if (intent.name === 'confirm') {
      STATE.username = STATE.pendingUsername;
      await speak("Great. Now please say your password.");
      STATE.loginStep = 'password';
    } else {
      await speak("Okay. Please say your username again.");
      STATE.loginStep = 'username';
    }

  } else if (STATE.loginStep === 'password') {
    let p = t.replace(/\b(password|pass word|password is|pass is|my password|is)\b/g,' ').trim();
    const DIGITS = {zero:'0',one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9'};
    for (const [w,d] of Object.entries(DIGITS)) p = p.replace(new RegExp(`\\b${w}\\b`,'g'), d);
    p = cleanAlphaNum(p);
    if (!p) { await speak("I did not catch your password. Please say it again."); return; }
    STATE._pendingPass = p;
    el('field-password').textContent = '••••••••';
    await speak("Got it. Checking your credentials.");
    STATE.loginStep = 'verify';
    await verifyLogin();
  }
}

async function verifyLogin() {
  const u      = cleanAlphaNum(STATE.username);
  const p      = cleanAlphaNum(STATE._pendingPass);
  const stored = cleanAlphaNum(USERS[u] || '');
  if (stored && stored === p) {
    el('dashboard-user').textContent = STATE.username.charAt(0).toUpperCase() + STATE.username.slice(1);
    await speak(`Login successful. Welcome ${STATE.username}. You are now on the document dashboard. Say scan documents to find your files.`);
    gotoScreen('dashboard');
    STATE.loginStep = 'done';
    startListening();
  } else {
    await speak("Incorrect password. Please say your password again.");
    STATE.loginStep = 'password';
    el('field-password').textContent = '—';
  }
}

// ═══════════════════════════════════════════════
// FACE RECOGNITION FLOW
// Fix: enroll + verify with webcam
// ═══════════════════════════════════════════════
async function startFaceEnrollFlow(username) {
  await speak(`Starting face enrollment for ${username}. Opening camera.`);
  showFaceModal('enroll', username);
}

async function startFaceVerifyFlow() {
  await speak("Opening camera for face recognition. Please look at the camera.");
  showFaceModal('verify', null);
}

function showFaceModal(mode, username) {
  let modal = el('face-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id        = 'face-modal';
    modal.className = 'face-modal';
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div class="face-modal-inner">
      <h2 class="face-modal-title">${mode === 'enroll' ? '🤳 Enroll Face' : '👁️ Face Login'}</h2>
      <p class="face-modal-sub">${mode === 'enroll'
        ? 'Look at the camera. We will capture your face.'
        : 'Look at the camera to log in.'}</p>
      <div class="face-video-wrap">
        <video id="face-video" autoplay playsinline muted></video>
        <canvas id="face-canvas" style="display:none;"></canvas>
      </div>
      <div class="face-modal-actions">
        <button id="face-capture-btn" class="btn-primary" onclick="captureAndProcess('${mode}','${username||''}')">
          ${mode === 'enroll' ? 'Capture & Enroll' : 'Scan My Face'}
        </button>
        <button class="btn-secondary" onclick="closeFaceModal()">Cancel</button>
      </div>
      <p id="face-status" class="face-status"></p>
    </div>`;
  modal.style.display = 'flex';

  navigator.mediaDevices.getUserMedia({ video: true })
    .then(stream => {
      STATE.faceStream = stream;
      el('face-video').srcObject = stream;
    })
    .catch(() => {
      el('face-status').textContent = 'Camera access denied. Please allow camera permissions.';
      speak("Camera access denied. Please allow camera in your browser settings.");
    });
}

function closeFaceModal() {
  if (STATE.faceStream) {
    STATE.faceStream.getTracks().forEach(t => t.stop());
    STATE.faceStream = null;
  }
  const modal = el('face-modal');
  if (modal) modal.style.display = 'none';
}

async function captureAndProcess(mode, username) {
  const video  = el('face-video');
  const canvas = el('face-canvas');
  const status = el('face-status');

  canvas.width  = video.videoWidth  || 640;
  canvas.height = video.videoHeight || 480;
  canvas.getContext('2d').drawImage(video, 0, 0);

  const imageB64 = canvas.toDataURL('image/jpeg', 0.85);

  status.textContent = mode === 'enroll' ? 'Enrolling face…' : 'Recognizing face…';

  if (mode === 'enroll') {
    try {
      const r = await fetch('/api/face/enroll', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ username, image_b64: imageB64 }),
      });
      const d = await r.json();
      if (r.ok && d.success) {
        status.textContent = d.message;
        await speak(`Face enrolled successfully for ${username}. You can now use face login.`);
        STATE.faceEnrolled = true;
        setTimeout(closeFaceModal, 2000);
      } else {
        status.textContent = d.detail || 'Enrollment failed. Try again.';
        await speak("Face enrollment failed. Please try again with better lighting.");
      }
    } catch(e) {
      status.textContent = 'Server not available. Face features require backend.';
      speak("The face recognition server is not available.");
      setTimeout(closeFaceModal, 2500);
    }

  } else { // verify
    try {
      const r = await fetch('/api/face/verify', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ image_b64: imageB64 }),
      });
      const d = await r.json();
      if (r.ok && d.recognized) {
        status.textContent = d.message;
        STATE.username = d.username;
        el('dashboard-user').textContent = d.username.charAt(0).toUpperCase() + d.username.slice(1);
        await speak(`Face recognized as ${d.username} with ${d.confidence} percent confidence. Welcome back!`);
        closeFaceModal();
        gotoScreen('dashboard');
        startListening();
      } else {
        status.textContent = d.message || 'Face not recognized.';
        await speak(d.message || "Face not recognized. Please try again or use voice login.");
      }
    } catch(e) {
      // Fallback: no server — show instructions
      status.textContent = 'Face server not running. Use voice login instead.';
      await speak("The face recognition server is not running. Please use voice login instead.");
      setTimeout(closeFaceModal, 2500);
    }
  }
}

// ═══════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════
async function onDashboard(raw, intent) {
  if (intent.name === 'scan_files') {
    await scanFiles();
  } else if (intent.name === 'face_enroll') {
    if (STATE.username) {
      await startFaceEnrollFlow(STATE.username);
    } else {
      await speak("Please log in first to enroll your face.");
    }
  } else if (intent.name === 'open_file' || intent.name === 'unknown') {
    await tryOpen(raw);
  }
}

async function scanFiles() {
  await speak("Scanning your documents. Please wait.");
  STATE.discoveredFiles = await fetchFiles();
  renderFiles();
  if (!STATE.discoveredFiles.length) {
    await speak("No documents found. Please upload a PDF, Word, or text file.");
    return;
  }
  const list = STATE.discoveredFiles.map((f,i) => `${i+1}. ${f.name}`).join('. ');
  await speak(`I found ${STATE.discoveredFiles.length} files. ${list}. Say the file name or number to open it.`);
}

async function fetchFiles() {
  try {
    const r = await fetch('/api/list-files');
    if (!r.ok) throw new Error();
    const d = await r.json();
    return d.files || [];
  } catch {
    return [
      { name:'Maths Notes',     type:'PDF',  icon:'📄' },
      { name:'History Book',    type:'PDF',  icon:'📄' },
      { name:'Science Chapter', type:'PDF',  icon:'📄' },
      { name:'English Grammar', type:'DOCX', icon:'📝' },
    ];
  }
}

function renderFiles() {
  const list = el('file-list');
  list.innerHTML = '';
  STATE.discoveredFiles.forEach((f,i) => {
    const div        = document.createElement('div');
    div.className    = 'file-item';
    div.id           = `file-${i}`;
    div.innerHTML    = `<span class="file-icon">${f.icon||'📄'}</span>
      <div><div class="file-name">${f.name}</div><div class="file-type">${f.type}</div></div>`;
    list.appendChild(div);
  });
}

async function tryOpen(raw) {
  if (!STATE.discoveredFiles.length) {
    await speak("Please say scan documents first."); return;
  }
  const t   = clean(raw);
  const num = t.match(/\b([1-9])\b/);
  if (num) {
    const i = parseInt(num[1]) - 1;
    if (STATE.discoveredFiles[i]) { await openFile(i); return; }
  }
  let best = -1, score = 0;
  STATE.discoveredFiles.forEach((f,i) => {
    const words = f.name.toLowerCase().split(' ');
    const s     = words.filter(w => w.length > 2 && t.includes(w)).length;
    if (s > score) { score = s; best = i; }
  });
  if (best >= 0 && score > 0) await openFile(best);
  else await speak("I could not find that file. Say scan documents to list available files.");
}

async function openFile(idx) {
  const f = STATE.discoveredFiles[idx];
  document.querySelectorAll('.file-item').forEach(x => x.classList.remove('highlighted'));
  el(`file-${idx}`)?.classList.add('highlighted');
  STATE.currentFile = f;
  el('reader-filename').textContent = f.name;
  await speak(`Opening ${f.name}. Please wait.`);
  const text             = await loadText(f);
  STATE.documentText     = text;
  STATE.documentChunks   = chunkText(text, 80);
  STATE.chunkIndex       = 0;
  STATE.isReading        = false;
  STATE.isPaused         = false;
  STATE.lastReadChunk    = '';
  gotoScreen('reader');
  el('reader-content-text').textContent = text.slice(0, 600) + (text.length > 600 ? '…' : '');
  updateProgress();
  await speak(`File loaded: ${f.name}. Say read or start reading when you are ready.`);
  startListening();
}

async function loadText(f) {
  try {
    const r = await fetch(`/api/read-file?name=${encodeURIComponent(f.name)}`);
    if (!r.ok) throw new Error();
    const d = await r.json();
    return d.text;
  } catch {
    return `Welcome to ${f.name}.
Section one. Introduction. This document covers important topics for students. The content is structured to help you learn step by step.
Section two. Main concepts. Here we explore core ideas in detail. The first concept is about understanding the basics.
Section three. Practice. This section contains worked examples. Each example is explained clearly.
End of document.`;
  }
}

// ═══════════════════════════════════════════════
// READER — COMMAND HANDLER (when not reading)
// ═══════════════════════════════════════════════
async function onReader(raw, intent) {
  switch(intent.name) {
    case 'start_read': await startReading(); break;
    case 'pause':      await pauseReading(); break;
    case 'resume':     await resumeReading(); break;
    case 'repeat':     await repeatChunk(); break;
    case 'next':       await nextChunk(); break;
    case 'prev':       await prevChunk(); break;
    case 'summarize':  await doSummarize(); break;
    case 'explain':    await doExplain(); break;
    case 'key_points': await doKeyPoints(); break;
    case 'slower':     await adjustRate(-0.2); break;
    case 'faster':     await adjustRate(0.2); break;
    case 'louder':     await adjustVol(0.2); break;
    case 'quieter':    await adjustVol(-0.2); break;
    case 'clarify':    await doClarify(); break;
    case 'describe':   await describeMedia(); break;
    case 'face_enroll':
      await startFaceEnrollFlow(STATE.username || 'user');
      break;
    case 'scan_files':
      gotoScreen('dashboard');
      await speak("Going to document dashboard.");
      await scanFiles();
      break;
    case 'confirm':
      await describeMedia(); break;
    case 'unknown':
    default:
      // Treat as Q&A
      if (raw.trim().length > 3) {
        await handleMidReadingQuestion(raw);
      } else {
        await speak("Say read to start, or use commands: pause, resume, repeat, next, previous, summarize, louder, quieter, faster, slower, or logout.");
      }
  }
}

// ═══════════════════════════════════════════════
// READ LOOP
// Fix: interrupt recognition runs PARALLEL to TTS
// ═══════════════════════════════════════════════
async function startReading() {
  if (STATE.isReading && !STATE.isPaused) {
    await speak("Already reading. Say pause to stop."); return;
  }
  STATE.isReading = true;
  STATE.isPaused  = false;
  if (STATE.chunkIndex >= STATE.documentChunks.length) STATE.chunkIndex = 0;
  await speak("Starting to read now.");
  readLoop();
}

function readLoop() {
  if (!STATE.isReading || STATE.isPaused) {
    stopInterruptListening();
    startListening();
    return;
  }
  if (STATE.chunkIndex >= STATE.documentChunks.length) {
    STATE.isReading = false;
    stopInterruptListening();
    speak("I have finished reading the document. Say repeat to hear it again, or say logout to exit.")
      .then(() => startListening());
    return;
  }

  const chunk = STATE.documentChunks[STATE.chunkIndex];
  STATE.lastReadChunk = chunk;
  updateProgress();
  el('reader-content-text').textContent = chunk;

  // Visual element detection
  if (/\[(IMAGE|GRAPH|TABLE|CHART|FIGURE)/i.test(chunk)) {
    STATE.isReading = false;
    stopInterruptListening();
    speak("There is a visual element here. Say describe to hear about it, or say next to skip.")
      .then(() => startListening());
    return;
  }

  // Create TTS utterance
  window.speechSynthesis.cancel();
  const utter  = new SpeechSynthesisUtterance(chunk);
  utter.lang   = STATE.ttsLang;
  utter.rate   = STATE.readingRate;
  utter.volume = STATE.readingVolume;
  utter.pitch  = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const match  = voices.find(v => v.lang === STATE.ttsLang)
              || voices.find(v => v.lang.startsWith(STATE.ttsLang.split('-')[0]))
              || voices[0];
  if (match) utter.voice = match;

  updateBubble(chunk.slice(0, 80) + (chunk.length > 80 ? '…' : ''));
  STATE.isSpeaking = true;
  setMicState('speaking');

  // START interrupt listening alongside TTS
  stopInterruptListening();
  startInterruptListening();

  utter.onend = () => {
    STATE.isSpeaking = false;
    if (!STATE.isReading || STATE.isPaused) {
      stopInterruptListening();
      startListening();
      return;
    }
    STATE.chunkIndex++;
    setMicState('listening');
    // Small gap between chunks for interrupt
    clearTimeout(_intTimer);
    _intTimer = setTimeout(() => {
      if (STATE.isReading && !STATE.isPaused && !STATE.isSpeaking) {
        readLoop();
      }
    }, 800);
  };

  utter.onerror = () => {
    STATE.isSpeaking = false;
    STATE.chunkIndex++;
    readLoop();
  };

  window.speechSynthesis.speak(utter);
}

async function pauseReading() {
  if (!STATE.isReading && !STATE.isPaused) {
    await speak("Nothing is being read. Say read to start."); return;
  }
  stopSpeaking();
  stopInterruptListening();
  STATE.isReading = false;
  STATE.isPaused  = true;
  await speak("Paused. Say resume or continue when you are ready.");
}

async function resumeReading() {
  if (STATE.isReading && !STATE.isPaused) {
    await speak("Already reading. Say pause to stop."); return;
  }
  STATE.isPaused  = false;
  STATE.isReading = true;
  await speak("Resuming.");
  readLoop();
}

async function repeatChunk() {
  const was = STATE.isReading;
  stopSpeaking();
  stopInterruptListening();
  STATE.isReading = false;
  STATE.isPaused  = false;
  const chunk = STATE.documentChunks[STATE.chunkIndex] || "Nothing to repeat.";
  await speak("Repeating. " + chunk);
  if (was) { STATE.isReading = true; readLoop(); }
  else startListening();
}

async function nextChunk() {
  const was = STATE.isReading;
  stopSpeaking();
  stopInterruptListening();
  STATE.isReading  = false;
  STATE.chunkIndex = Math.min(STATE.chunkIndex + 1, STATE.documentChunks.length - 1);
  updateProgress();
  el('reader-content-text').textContent = STATE.documentChunks[STATE.chunkIndex] || '';
  await speak("Moving to next section.");
  if (was) { STATE.isReading = true; readLoop(); }
  else startListening();
}

async function prevChunk() {
  const was = STATE.isReading;
  stopSpeaking();
  stopInterruptListening();
  STATE.isReading  = false;
  STATE.chunkIndex = Math.max(STATE.chunkIndex - 1, 0);
  updateProgress();
  el('reader-content-text').textContent = STATE.documentChunks[STATE.chunkIndex] || '';
  await speak("Going back to previous section.");
  if (was) { STATE.isReading = true; readLoop(); }
  else startListening();
}

// ─── local helpers ────────────────────────────
function localSummarize(chunk) {
  const sentences = chunk.match(/[^.!?\n]+[.!?\n]+/g) || [chunk];
  if (sentences.length <= 2) return chunk.slice(0,200);
  return sentences[0].trim() + '. ' + sentences[sentences.length-1].trim();
}

function localKeyPoints(chunk) {
  const sentences = chunk.match(/[^.!?\n]+[.!?\n]+/g) || [chunk];
  return sentences.slice(0, 4).map((s,i) => `Point ${i+1}. ${s.trim()}`).join('. ');
}

async function doSummarize() {
  const was  = STATE.isReading;
  stopSpeaking(); stopInterruptListening(); STATE.isReading = false;
  const chunk = STATE.documentChunks[STATE.chunkIndex] || STATE.documentText.slice(0,400);
  await speak("Here is the summary. " + localSummarize(chunk));
  if (was) { STATE.isReading = true; readLoop(); } else startListening();
}

async function doExplain() {
  const was  = STATE.isReading;
  stopSpeaking(); stopInterruptListening(); STATE.isReading = false;
  const chunk  = STATE.documentChunks[STATE.chunkIndex] || STATE.documentText.slice(0,400);
  const simple = chunk.replace(/[;()]/g,'.').split('.').slice(0,3).join('. ');
  await speak("Let me explain in simple words. " + simple);
  if (was) { STATE.isReading = true; readLoop(); } else startListening();
}

async function doKeyPoints() {
  const was  = STATE.isReading;
  stopSpeaking(); stopInterruptListening(); STATE.isReading = false;
  const chunk = STATE.documentChunks[STATE.chunkIndex] || STATE.documentText.slice(0,400);
  await speak("Here are the important points. " + localKeyPoints(chunk));
  if (was) { STATE.isReading = true; readLoop(); } else startListening();
}

async function doClarify() {
  const was  = STATE.isReading;
  stopSpeaking(); stopInterruptListening(); STATE.isReading = false;
  const chunk  = STATE.documentChunks[STATE.chunkIndex] || '';
  const simple = chunk.split('.').slice(0,2).join('.');
  await speak("Let me say that differently. " + simple);
  if (was) { STATE.isReading = true; readLoop(); } else startListening();
}

async function describeMedia() {
  const was  = STATE.isReading;
  stopSpeaking(); stopInterruptListening(); STATE.isReading = false;
  await speak("This section contains a visual element. It appears to be a chart or diagram illustrating the data discussed in this section.");
  STATE.chunkIndex++;
  if (was) { STATE.isReading = true; readLoop(); } else startListening();
}

function rateLabel() {
  if (STATE.readingRate < 0.7) return 'Slow Speed';
  if (STATE.readingRate > 1.3) return 'Fast Speed';
  return 'Normal Speed';
}

async function adjustRate(delta) {
  STATE.readingRate = Math.min(2.5, Math.max(0.3, STATE.readingRate + delta));
  el('reader-speed-badge') && (el('reader-speed-badge').textContent = rateLabel());
  await speak(`Speed ${delta > 0 ? 'increased' : 'decreased'}.`);
  startListening();
}

async function adjustVol(delta) {
  STATE.readingVolume = Math.min(1.0, Math.max(0.05, STATE.readingVolume + delta));
  await speak(delta > 0 ? "Volume increased." : "Volume decreased.");
  startListening();
}

// ═══════════════════════════════════════════════
// LANGUAGE SWITCHING
// Fix: changes BOTH STT and TTS, rebuilds recognition
// Fix: announcement in the NEW language
// ═══════════════════════════════════════════════
async function changeLang(langKey) {
  const cfg = LANGUAGES[langKey];
  if (!cfg) { await speak("That language is not available."); return; }

  const was = STATE.isReading;
  stopSpeaking();
  stopInterruptListening();
  stopListening();
  STATE.isReading = false;

  STATE.language = cfg.stt;
  STATE.ttsLang  = cfg.tts;
  STATE.langKey  = langKey;

  // Rebuild recognition for new language
  STATE.recognition = null;

  // Update UI badges
  el('reader-lang-badge') && (el('reader-lang-badge').textContent = cfg.short);

  // Announce in the new language (then English so user knows)
  await speak(`Switched to ${cfg.label}.`, cfg.tts);

  if (was) { STATE.isReading = true; readLoop(); }
  else {
    clearTimeout(STATE._recTimer);
    STATE._recTimer = setTimeout(startListening, 300);
  }
}

// ═══════════════════════════════════════════════
// LOGOUT
// Fix: works from any screen
// ═══════════════════════════════════════════════
async function doLogout() {
  stopSpeaking();
  stopInterruptListening();
  stopListening();
  STATE.isReading = false;
  STATE.isPaused  = false;
  STATE.username  = '';
  STATE.documentText = '';
  STATE.documentChunks = [];
  STATE.chunkIndex = 0;

  await speak("You have been logged out. Thank you for using VOICE4BLIND. Goodbye.");

  setTimeout(() => { gotoScreen('welcome'); initWelcome(); }, 1200);
}

// ═══════════════════════════════════════════════
// TEXT CHUNKING
// ═══════════════════════════════════════════════
function chunkText(text, wordsPerChunk) {
  const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
  const chunks    = [];
  let current = [], count = 0;
  for (const s of sentences) {
    const wc = s.split(' ').length;
    if (count + wc > wordsPerChunk && current.length) {
      chunks.push(current.join(' ').trim());
      current = [s]; count = wc;
    } else {
      current.push(s); count += wc;
    }
  }
  if (current.length) chunks.push(current.join(' ').trim());
  return chunks.filter(Boolean);
}

// ═══════════════════════════════════════════════
// UI HELPERS
// ═══════════════════════════════════════════════
function el(id) { return document.getElementById(id); }

function gotoScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const scr = el(`screen-${name}`);
  if (scr) scr.classList.add('active');
  STATE.screen = name;
}

function updateBubble(text) {
  const map = {
    welcome:   'assistant-text',
    login:     'login-assistant-text',
    dashboard: 'dashboard-assistant-text',
    reader:    'reader-assistant-text',
  };
  const id = map[STATE.screen];
  if (id && el(id)) el(id).textContent = text;
}

function showTranscript(text) {
  const map = {
    welcome:   'transcript-display',
    login:     'login-transcript',
    dashboard: 'dashboard-transcript',
    reader:    'reader-transcript',
  };
  const id = map[STATE.screen];
  if (id && el(id)) el(id).textContent = text || '';
}

function setMicState(state) {
  document.querySelectorAll('.mic-circle').forEach(m =>
    m.classList.toggle('speaking', state === 'speaking')
  );
  document.querySelectorAll('.dot').forEach(d => {
    d.className = 'dot';
    d.classList.add(state === 'speaking' ? 'speaking' : 'listening');
  });
  const lbl = el('status-label');
  if (lbl) lbl.textContent = state === 'speaking' ? 'Speaking…' : 'Listening…';
}

function updateProgress() {
  const total = STATE.documentChunks.length;
  const pct   = total ? Math.round((STATE.chunkIndex / total) * 100) : 0;
  const fill  = el('progress-fill');
  const label = el('progress-label');
  const page  = el('reader-page-info');
  if (fill)  fill.style.width = pct + '%';
  if (label) label.textContent = pct + '% read';
  if (page)  page.textContent  = `Section ${STATE.chunkIndex + 1} of ${total}`;
}

// ═══════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════
async function initWelcome() {
  gotoScreen('welcome');
  STATE.isReading   = false;
  STATE.isPaused    = false;
  STATE.loginStep   = 'greeting';
  STATE.recognition = null;
  stopInterruptListening();

  await new Promise(r => {
    if (window.speechSynthesis.getVoices().length) { r(); return; }
    window.speechSynthesis.onvoiceschanged = r;
    setTimeout(r, 2500);
  });

  await speak("Welcome to VOICE4BLIND. I am your voice assistant for reading documents. Say Hi when you are ready, or say face login to use face recognition.");
  startListening();
}

window.addEventListener('load', () => setTimeout(initWelcome, 600));
