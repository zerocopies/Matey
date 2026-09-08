console.log('[MateyMic DEBUG] Script loading...');

// Test the mic transcription pipeline
let testCount = 0;

async function testMicTranscription() {
  testCount++;
  console.log('[MateyMic DEBUG] testMicTranscription() call #' + testCount);
  
  // Check for MateyMic
  if (!window.MateyMic) {
    console.error('[MateyMic DEBUG] MateyMic not available');
    return;
  }
  
  // Get the active input field
  let input = document.activeElement || document.getElementById('journal-content-input') || 
              document.getElementById('md-compose-input') || 
              document.getElementById('vots-content-input');
  
  if (!input) {
    console.error('[MateyMic DEBUG] No input field found');
    return;
  }
  
  // Check mic button
  let btn = document.getElementById('toolbar-mic-btn') || document.querySelector('.md-mic-btn') || document.getElementById('md-voice');
  
  console.log('[MateyMic DEBUG] Test setup: input=' + input.id, 'btn=', btn ? btn.id : 'none');
  
  // Wait for MateyMic to be ready
  if (window.MateyMic.getState().active) {
    console.log('[MateyMic DEBUG] Mic already active, stopping it first');
    window.MateyMic.stopRecording();
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Focus the input
  input.focus();
  
  // Start recording via MateyMic.runLocalSTT if available
  if (typeof window.runLocalSTT === 'function') {
    console.log('[MateyMic DEBUG] Calling runLocalSTT()...');
    
    try {
      window.runLocalSTT().then(function(text) {
        console.log('[MateyMic DEBUG] runLocalSTT() returned:', text);
        
        if (text && text.trim()) {
          // Insert the text into the input
          let current = input.value || '';
          input.value = current + (current ? '\n' : '') + text.trim();
          input.dispatchEvent(new Event('input', { bubbles: true }));
          console.log('[MateyMic DEBUG] Text inserted into input:', text.trim());
        } else {
          console.log('[MateyMic DEBUG] No text returned from runLocalSTT');
        }
      }).catch(function(err) {
        console.error('[MateyMic DEBUG] runLocalSTT() failed:', err);
      });
    } catch (err) {
      console.error('[MateyMic DEBUG] Error calling runLocalSTT:', err);
    }
  } else {
    console.error('[MateyMic DEBUG] runLocalSTT() not available');
  }
}

// Add test button
function addTestButton() {
  if (document.getElementById('test-mic-btn')) return;
  
  const btn = document.createElement('button');
  btn.id = 'test-mic-btn';
  btn.textContent = 'TEST MIC';
  btn.style.position = 'fixed';
  btn.style.top = '10px';
  btn.style.left = '10px';
  btn.style.zIndex = '9999';
  btn.style.padding = '10px';
  btn.style.background = '#ff6b6b';
  btn.style.color = 'white';
  btn.style.border = 'none';
  btn.style.borderRadius = '5px';
  btn.style.cursor = 'pointer';
  btn.onclick = testMicTranscription;
  document.body.appendChild(btn);
  
  console.log('[MateyMic DEBUG] Test button added');
}

// Monitor for transcription results
function monitorForTranscription() {
  document.addEventListener('input', function(e) {
    if (e.target === document.activeElement && e.target.tagName === 'TEXTAREA' && e.target.value.includes('test')) {
      console.log('[MateyMic DEBUG] Test text detected in active element:', e.target.value.substring(0, 100));
    }
  });
}

function init() {
  console.log('[MateyMic DEBUG] Initializing mic test');
  addTestButton();
  monitorForTranscription();
  
  // Check if MateyMic is loaded
  setTimeout(function() {
    if (window.MateyMic) {
      console.log('[MateyMic DEBUG] MateyMic state:', window.MateyMic.getState());
    } else {
      console.log('[MateyMic DEBUG] MateyMic not yet loaded');
    }
  }, 1000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
