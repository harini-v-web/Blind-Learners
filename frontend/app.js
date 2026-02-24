
'use strict';

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────
const STATE = {
  screen: 'welcome',
  loginStep: 'greeting',
  username: '',
  pendingUsername: '',
  language: 'en-US',
  ttsLang: 'en-US',
  readingRate: 1.0,
  readingVolume: 1.0,
  documentText: '',
  documentChunks: [],
  chunkIndex: 0,
  isReading: false,
  isPaused: false,
  currentFile: null,
  discoveredFiles: [],
  isListening: false,
  isSpeaking: false,
  recognition: null,
  _pendingPass: '',
};

// ─────────────────────────────────────────────
// USERS
// ─────────────────────────────────────────────
const USERS = { harini:'1234', demo:'demo', user:'password', admin:'admin' };

// ─────────────────────────────────────────────
// LANGUAGES + native triggers
// ─────────────────────────────────────────────
const LANGUAGES = {
  english:{stt:'en-US',tts:'en-US',label:'English',short:'EN',triggers:['switch to english','english please','speak english']},
  hindi:{stt:'hi-IN',tts:'hi-IN',label:'Hindi',short:'HI',triggers:['hindi mein bolo','change to hindi']},
  kannada:{stt:'kn-IN',tts:'kn-IN',label:'Kannada',short:'KN',triggers:['kannadakke badalisu','change to kannada']},
  tamil:{stt:'ta-IN',tts:'ta-IN',label:'Tamil',short:'TA',triggers:['tamilil pesi','change to tamil']},
  telugu:{stt:'te-IN',tts:'te-IN',label:'Telugu',short:'TE',triggers:['telugulo chappu','change to telugu']},
  malayalam:{stt:'ml-IN',tts:'ml-IN',label:'Malayalam',short:'ML',triggers:['malayalatthil paranju','change to malayalam']},
  marathi:{stt:'mr-IN',tts:'mr-IN',label:'Marathi',short:'MR',triggers:['marathit bola','change to marathi']},
  bengali:{stt:'bn-IN',tts:'bn-IN',label:'Bengali',short:'BN',triggers:['banglay bolo','change to bengali']},
  gujarati:{stt:'gu-IN',tts:'gu-IN',label:'Gujarati',short:'GU',triggers:['gujaratima bolo','change to gujarati']},
  punjabi:{stt:'pa-IN',tts:'pa-IN',label:'Punjabi',short:'PA',triggers:['punjabi vich bolo','change to punjabi']},
  urdu:{stt:'ur-PK',tts:'ur-PK',label:'Urdu',short:'UR',triggers:['urdu mein bolo','change to urdu']},
  odia:{stt:'or-IN',tts:'or-IN',label:'Odia',short:'OR',triggers:['odialare kahu','change to odia']},
  assamese:{stt:'as-IN',tts:'as-IN',label:'Assamese',short:'AS',triggers:['asamiyat kowa','change to assamese']},
};

// ─────────────────────────────────────────────
// INTENTS
// ─────────────────────────────────────────────
const INTENTS = [
  {name:'start_read',words:['start reading','begin reading','read now']},
  {name:'pause',words:['stop','pause','wait']},
  {name:'resume',words:['resume','continue']},
  {name:'repeat',words:['repeat','say again']},
  {name:'next',words:['next','skip']},
  {name:'prev',words:['previous','back']},
  {name:'summarize',words:['summarize','summary']},
  {name:'explain',words:['explain','simple words']},
  {name:'key_points',words:['important points','key points']},
  {name:'slower',words:['read slower','slow down']},
  {name:'faster',words:['read faster','speed up']},
  {name:'louder',words:['louder','volume up']},
  {name:'quieter',words:['quieter','volume down']},
  {name:'clarify',words:["didn't understand","not clear"]},
  {name:'describe',words:['describe','describe image']},
  {name:'scan_files',words:['scan documents','list files']},
  {name:'open_file',words:['open','load file']},
  {name:'username',words:['username','my name is']},
  {name:'set_password',words:['password','my password']},
  {name:'greeting',words:['hi','hello','ready']},
  {name:'confirm',words:['yes','correct','ok']},
  {name:'deny',words:['no','wrong']},
  {name:'logout',words:['logout','exit','bye']},
];

// ─────────────────────────────────────────────
// INTENT DETECTION
// ─────────────────────────────────────────────
function detectIntent(text){
  const t=text.toLowerCase();
  for(const [langKey,cfg] of Object.entries(LANGUAGES)){
    for(const trigger of cfg.triggers){
      if(t.includes(trigger)) return {name:'change_lang',lang:langKey};
    }
  }
  for(const intent of INTENTS){
    for(const word of intent.words){
      if(t.includes(word)) return {name:intent.name};
    }
  }
  return {name:'unknown'};
}

// ─────────────────────────────────────────────
// TTS ENGINE
// ─────────────────────────────────────────────
function speak(text){ /* full Creao implementation here */ }
function stopSpeaking(){ window.speechSynthesis.cancel(); STATE.isSpeaking=false; }

// ─────────────────────────────────────────────
// SPEECH RECOGNITION
// ─────────────────────────────────────────────
function buildRecognition(){ /* Creao anti-lag implementation */ }
function startListening(){ /* Creao implementation */ }
function stopListening(){ /* Creao implementation */ }

// ─────────────────────────────────────────────
// ROUTER
// ─────────────────────────────────────────────
async function processVoice(raw){
  const intent=detectIntent(raw);
  if(intent.name==='change_lang'){await changeLang(intent.lang);return;}
  if(intent.name==='logout'){await doLogout();return;}
  switch(STATE.screen){
    case 'welcome':await onWelcome(raw,intent);break;
    case 'login':await onLogin(raw,intent);break;
    case 'dashboard':await onDashboard(raw,intent);break;
    case 'reader':await onReader(raw,intent);break;
  }
}

// ─────────────────────────────────────────────
// SCREEN HANDLERS (Welcome, Login, Dashboard, Reader)
// ─────────────────────────────────────────────
async function onWelcome(raw,intent){ /* Creao implementation */ }
async function onLogin(raw,intent){ /* Creao implementation */ }
async function verifyLogin(){ /* Creao implementation */ }
async function onDashboard(raw,intent){ /* Creao implementation */ }
async function scanFiles(){ /* Creao implementation */ }
async function tryOpen(raw){ /* Creao implementation */ }
async function openFile(idx){ /* Creao implementation */ }
async function loadText(f){ /* Creao implementation */ }
async function onReader(raw,intent){ /* Creao implementation */ }

// ─────────────────────────────────────────────
// READING LOOP + COMMANDS
// ─────────────────────────────────────────────
async function startReading(){ /* Creao implementation */ }
function readLoop(){ /* Creao implementation */ }
async function pauseReading(){ /* Creao implementation */ }
async function resumeReading(){ /* Creao implementation */ }
async function repeatChunk(){ /* Creao implementation */ }
async function nextChunk(){ /* Creao implementation */ }
async function prevChunk(){ /* Creao implementation */ }
async function summarize(){ /* Creao implementation */ }
async function explain(){ /* Creao implementation */ }
async function keyPoints(){ /* Creao implementation */ }
async function clarify(){ /* Creao implementation */ }
async function describeMedia(){ /* Creao implementation */ }
async function adjustRate(delta){ /* Creao implementation */ }
async function adjustVol(delta){ /* Creao implementation */ }
async function changeLang(langKey){ /* Creao implementation */ }
async function doLogout(){ /* Creao implementation */ }

// ─────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────
function chunkText(text,wordsPerChunk){ /* Creao implementation */ }
function el(id){return document.getElementById(id);}
function gotoScreen(name){ /* Creao implementation */ }
function updateBubble(text){ /* Creao implementation */ }
function showTranscript(text){ /* Creao implementation */ }
function setMicState(state){ /* Creao implementation */ }
function updateProgress(){ /* Creao implementation */ }

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
async function initWelcome(){ /* Creao implementation */ }
window.addEventListener('load',()=>setTimeout(initWelcome,600));
// ─────────────────────────────────────────────
// TTS ENGINE — full implementation
// ─────────────────────────────────────────────
function speak(text) {
  return new Promise(resolve => {
    if (!text) { resolve(); return; }
    window.speechSynthesis.cancel();
    STATE.isSpeaking = true;
    stopListening();
    setMicState('speaking');
    updateBubble(text);

    const utter = new SpeechSynthesisUtterance(text);
    utter.lang   = STATE.ttsLang;
    utter.rate   = STATE.readingRate;
    utter.volume = STATE.readingVolume;
    utter.pitch  = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const match  = voices.find(v => v.lang.startsWith(STATE.ttsLang))
                || voices.find(v => v.lang.startsWith(STATE.ttsLang.split('-')[0]))
                || voices[0];
    if (match) utter.voice = match;

    utter.onend = () => {
      STATE.isSpeaking = false;
      setMicState('listening');
      resolve();
      if (!STATE.isReading || STATE.isPaused) setTimeout(()=>startListening(), 150);
    };
    utter.onerror = () => {
      STATE.isSpeaking = false;
      resolve();
      setTimeout(()=>startListening(), 150);
    };
    window.speechSynthesis.speak(utter);
  });
}

function stopSpeaking() {
  window.speechSynthesis.cancel();
  STATE.isSpeaking = false;
}

// ─────────────────────────────────────────────
// SPEECH RECOGNITION — anti-lag implementation
// ─────────────────────────────────────────────
let _recTimer = null;

function buildRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert('Use Chrome or Edge for voice support.'); return null; }
  const rec = new SR();
  rec.continuous     = false;
  rec.interimResults = false;
  rec.lang           = STATE.language;
  rec.maxAlternatives = 3;

  rec.onstart = () => { STATE.isListening = true; setMicState('listening'); };

  rec.onresult = e => {
    const results = e.results[0];
    let best = '';
    for (let i = 0; i < results.length; i++) {
      if (results[i].transcript.trim()) { best = results[i].transcript.trim(); break; }
    }
    if (best) {
      showTranscript('"' + best + '"');
      processVoice(best);
    }
  };

  rec.onend = () => {
    STATE.isListening = false;
    if (!STATE.isSpeaking) {
      clearTimeout(_recTimer);
      _recTimer = setTimeout(()=>startListening(), 250);
    }
  };

  rec.onerror = e => {
    STATE.isListening = false;
    if (e.error === 'no-speech' || e.error === 'aborted') {
      if (!STATE.isSpeaking) { clearTimeout(_recTimer); _recTimer = setTimeout(()=>startListening(),250); }
      return;
    }
    clearTimeout(_recTimer);
    _recTimer = setTimeout(()=>startListening(), 800);
  };
  return rec;
}

function startListening() {
  if (STATE.isSpeaking || STATE.isListening) return;
  if (!STATE.recognition) STATE.recognition = buildRecognition();
  if (!STATE.recognition) return;
  STATE.recognition.lang = STATE.language;
  try { STATE.recognition.start(); } catch(e){}
}

function stopListening() {
  clearTimeout(_recTimer);
  if (STATE.recognition && STATE.isListening) {
    try { STATE.recognition.abort(); } catch(e){}
  }
  STATE.isListening = false;
}

// ─────────────────────────────────────────────
// HELPERS (already defined earlier)
// ─────────────────────────────────────────────
// el, gotoScreen, updateBubble, showTranscript, setMicState, updateProgress, chunkText

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────
async function initWelcome(){
  gotoScreen('welcome');
  STATE.isReading=false; STATE.isPaused=false;
  STATE.loginStep='greeting'; STATE.recognition=null;
  await new Promise(r=>{
    if(window.speechSynthesis.getVoices().length){r();return;}
    window.speechSynthesis.onvoiceschanged=r;
    setTimeout(r,2500);
  });
  await speak("Welcome to VOICE4BLIND. I am your voice assistant for reading documents. If you are ready, please say Hi.");
  startListening();
}

window.addEventListener('load',()=>setTimeout(initWelcome,600));
