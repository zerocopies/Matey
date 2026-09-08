console.log('[MateyMic DEBUG] Script loading...');

// Test capturing mic and attaching it
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];

// Function to toggle recording
function toggleRecording() {
  const btn = document.getElementById('toolbar-mic-btn') || document.querySelector('.md-mic-btn') || document.getElementById('md-voice');
  
  if (!btn) {
    console.error('[MateyMic DEBUG] No mic button found');
    return;
  }
  
  if (isRecording) {
    // Stop recording
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      mediaRecorder.stop();
    }
    btn.textContent = 'RECORD';
    btn.style.background = '#ff6b6b';
    isRecording = false;
    console.log('[MateyMic DEBUG] Recording stopped');
  } else {
    // Start recording
    console.log('[MateyMic DEBUG] Starting recording...');
    startRecording();
    btn.textContent = 'STOP';
    btn.style.background = '#51cf66';
    isRecording = true;
  }
}

// Start recording function
async function startRecording() {
  try {
    // Check if MateyMic is available
    if (window.MateyMic) {
      console.log('[MateyMic DEBUG] MateyMic state:', window.MateyMic.getState());
      // Start MateyMic recording
      window.MateyMic.startRecording();
      return;
    }
    
    // Fallback: try to use native MediaRecorder directly
    console.log('[MateyMic DEBUG] MateyMic not available, using native MediaRecorder');
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    
    mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
    
    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
        console.log('[MateyMic DEBUG] Audio chunk captured:', event.data.size, 'bytes');
      }
    };
    
    mediaRecorder.onstop = () => {
      console.log('[MateyMic DEBUG] Recording stopped, chunks:', recordedChunks.length);
      const blob = new Blob(recordedChunks, { type: 'audio/webm' });
      console.log('[MateyMic DEBUG] Total blob size:', blob.size, 'bytes');
      
      // Try to transcribe
      if (window.MateyWhisper && typeof window.MateyWhisper.transcribe === 'function') {
        console.log('[MateyMic DEBUG] Attempting to transcribe with MateyWhisper');
        window.MateyWhisper.transcribe(blob, (result) => {
          console.log('[MateyMic DEBUG] Transcription result:', result);
        });
      }
      
      recordedChunks = [];
    };
    
    mediaRecorder.start(250);
    console.log('[MateyMic DEBUG] MediaRecorder started');
    
  } catch (error) {
    console.error('[MateyMic DEBUG] Error starting recording:', error);
  }
}

// Add test button
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
  btn.onclick = toggleRecording;
  document.body.appendChild(btn);
  
  console.log('[MateyMic DEBUG] Test button added');
}

function init() {
  console.log('[MateyMic DEBUG] Initializing test mode');
  addTestButton();
  
  // Monitor MateyMic state if available
  if (window.MateyMic && window.MateyMic.onStateChange) {
    window.MateyMic.onStateChange(function(state) {
      console.log('[MateyMic DEBUG] MateyMic state changed:', state);
    });
  }
  
  // Log transcription events
  document.addEventListener('input', function(e) {
    if (e.target && e.target.classList.contains('matey-transcribed')) {
      console.log('[MateyMic DEBUG] Text transcribed:', e.target.value);
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
