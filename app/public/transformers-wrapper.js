import * as t from './transformers.min.js';
window.pipeline = t.pipeline;
window.transformersEnv = t.env;
console.log('[MateyWhisper] Transformers loaded locally, env:', t.env ? 'has env' : 'no env');
