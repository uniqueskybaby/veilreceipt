import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';

// Process-local rehearsal: deny outbound requests, retain files and in-process EVM.
// No system firewall or browser setting is modified.
const denied=()=>{throw new Error('OFFLINE_REHEARSAL: network access denied');};
globalThis.fetch=denied;
net.connect=net.createConnection=denied;
tls.connect=denied;
http.request=http.get=https.request=https.get=denied;
syncBuiltinESMExports();
console.log('Network disabled inside this test process. Using cached SRS.');
await import('./smoke.mjs');
