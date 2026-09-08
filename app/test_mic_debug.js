console.log('[MateyMic DEBUG] Script loading...');

let testCounter = 0;

function testRecording() {
  testCounter++;
  console.log('[MateyMic DEBUG] testRecording() called -', testCounter);
  
  if (!window.MateyMic) {
    console.error('[MateyMic DEBUG] MateyMic not found!');
    return;
  }
  
  console.log('[MateyMic DEBUG] MateyMic state:', window.MateyMic.getState());
  
  const btn = document.getElementById('toolbar-mic-btn') || document.querySelector('.md-mic-btn') || document.getElementById('md-voice');
  if (!btn) {
    console.error('[MateyMic DEBUG] No mic button found');
    return;
  }
  
  console.log('[MateyMic DEBUG] Button found:', btn);
  
  if (window.MateyMic.getState().active) {
    console.log('[MateyMic DEBUG] Stopping recording...');
    window.MateyMic.stopRecording();
  } else {
    console.log('[MateyMic DEBUG] Starting recording...');
    window.MateyMic.startRecording();
  }
}

// Add button to page
function addTestButton() {
  if (document.getElementById('test-mic-btn')) return;
  
  const btn = document.createElement('button');
  btn.id = 'test-mic-btn';
  btn.textContent = 'TEST MIC';
  btn.style.position = 'fixed';
  btn.style.bottom = '10px';
  btn.style.right = '10px';
  btn.style.zIndex = '9999';
  btn.style.padding = '10px';
  btn.style.background = '#ff6b6b';
  btn.style.color = 'white';
  btn.style.border = 'none';
  btn.style.borderRadius = '5px';
  btn.style.cursor = 'pointer';
  btn.onclick = testRecording;
  document.body.appendChild(btn);
  
  console.log('[MateyMic DEBUG] Test button added');
}

// Monitor MateyMic state changes
function monitorMicState() {
  if (window.MateyMic && window.MateyMic.onStateChange) {
    window.MateyMic.onStateChange(function(state) {
      console.log('[MateyMic DEBUG] State changed:', state);
    });
  }
}

// Monitor audio transcription
function monitorTranscription() {
  document.addEventListener('input', function(e) {
    if (e.target && e.target.classList.contains('matey-transcribed')) {
      console.log('[MateyMic DEBUG] Text transcribed:', e.target.value);
    }
  });
}

function init() {
  console.log('[MateyMic DEBUG] Initializing test mode');
  addTestButton();
  monitorMicState();
  monitorTranscription();
  
  // Also add a more detailed test
  console.log('[MateyMic DEBUG] Available inputs:', 
    document.querySelectorAll('input, textarea').length);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}