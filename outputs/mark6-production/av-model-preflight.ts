import {writeFileSync} from 'node:fs';
import {GEMINI_TEXT_MODEL} from '../../src/providers/gemini-text.js';
(await import('dotenv')).config({path:'C:/Users/danbr/OneDrive/Documents/HeartWord/.env'});
const key=process.env.GEMINI_API_KEY;if(!key)throw Error('AV model metadata key missing');
const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}`,{headers:{'x-goog-api-key':key},signal:AbortSignal.timeout(30000)});
if(!response.ok)throw Error(`Read-only AV model metadata failed with HTTP ${response.status}; no generation requested`);
const value=await response.json() as any;
if(value.name!==`models/${GEMINI_TEXT_MODEL}`||!Number.isSafeInteger(value.inputTokenLimit)||value.inputTokenLimit<1||!Number.isSafeInteger(value.outputTokenLimit)||value.outputTokenLimit<8192)throw Error('Model token limits unavailable');
const result={observedAt:new Date().toISOString(),model:GEMINI_TEXT_MODEL,inputTokenLimit:value.inputTokenLimit,outputTokenLimit:value.outputTokenLimit,
 maxReviewOutputTokens:8192,conservativeRequestReserveUsd:Math.ceil((value.inputTokenLimit*.75+8192*3.75)/1000000*100)/100,
 pricingSource:'https://ai.google.dev/gemini-api/docs/pricing',pricingValidThrough:'2026-12-31',ratesUsdPerMillion:{input:.75,outputIncludingThinking:3.75},
 route:'read-only model metadata, no generateContent',generationRequests:0};
writeFileSync('outputs/mark6-production/av-model-preflight.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
