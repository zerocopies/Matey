// Module worker test — verifies ESM import works in worker
import { fibonacci } from './test-worker-module.js';

self.onmessage = function(e) {
  const { id, type, payload } = e.data;
  if (type === 'fib') {
    const result = fibonacci(payload.n);
    self.postMessage({ id, type: 'fibResult', payload: { result } });
  }
};
