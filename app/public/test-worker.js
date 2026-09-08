// Trivial test worker — verifies Web Workers work in Capacitor Android WebView
self.onmessage = function(e) {
  const { id, type, payload } = e.data;
  if (type === 'ping') {
    self.postMessage({ id, type: 'pong', payload: { received: payload, workerSelf: true } });
  } else if (type === 'compute') {
    // Heavy computation to test non-blocking
    let sum = 0;
    for (let i = 0; i < 10000000; i++) sum += i;
    self.postMessage({ id, type: 'computeResult', payload: { sum } });
  }
};
