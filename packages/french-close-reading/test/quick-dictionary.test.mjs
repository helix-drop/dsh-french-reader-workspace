import test from 'node:test'
import assert from 'node:assert/strict'
import { QuickDictionary, parseDictionary, dictionaryUrl } from '../lib/quick-dictionary.js'
import { createBacking, openController, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
const data = { fr: [{ language: 'French', partOfSpeech: 'Adjective', definitions: [{ definition: '<a href="/wiki/favourite">favourite</a>' }] }, { language: 'French', partOfSpeech: 'Participle', definitions: [{ definition: 'past participle of <i>préférer</i>' }] }], other: [{ language: 'English', definitions: [{ definition: 'wrong language' }] }] }
const response = (value = data) => ({ statusCode: 200, body: { content: JSON.stringify(value) }, truncated: false })
test('quick dictionary keeps French glosses only, strips markup and bounds senses', () => {
 assert.deepEqual(parseDictionary(JSON.stringify(data)), [{ partOfSpeech: '形容词', text: 'favourite' }, { partOfSpeech: '分词', text: 'past participle of préférer' }])
 assert.equal(parseDictionary(JSON.stringify({fr:[{language:'French',definitions:Array.from({length:9},(_,i)=>({definition:String(i).repeat(500)}))}]})).length,3)
 assert.equal(parseDictionary('{"other":[]}').length,0)
 assert.match(dictionaryUrl('préféré'), /pr%C3%A9f%C3%A9r%C3%A9$/)
})
test('successful dictionary queries reuse the normalized read-only cache', async () => {
 const dictionary=new QuickDictionary();let calls=0
 const fetch=async()=>{calls++;return response()}
 const first=await dictionary.lookup('Préféré',fetch,signal())
 assert.equal(first.status,'found')
 assert.deepEqual(await dictionary.lookup('pre\u0301fe\u0301re\u0301',fetch,signal()),first)
 assert.equal(calls,1)
})
test('timeout resolves even when the provider ignores abort and does not cache late text', async () => {
 const dictionary=new QuickDictionary();let finish, remoteSignal
 const pending=dictionary.lookup('préféré',async(_url,s)=>{remoteSignal=s;return await new Promise(r=>{finish=r})},signal(),10)
 assert.equal((await pending).status,'unavailable');assert.equal(remoteSignal.aborted,true)
 finish(response());assert.equal((await dictionary.lookup('préféré',async()=>response(),signal())).status,'found')
})
test('caller cancellation, HTTP failures, truncated bodies and malformed JSON remain honest', async () => {
 const dictionary=new QuickDictionary();const cancelled=new AbortController();cancelled.abort()
 assert.equal((await dictionary.lookup('mot',async()=>{throw Error('must not fetch')},cancelled.signal)).status,'unavailable')
 for(const r of [{...response(),statusCode:404},{...response(),statusCode:429},{...response(),truncated:true},{...response(),body:{content:'invalid'}}]) {
  const v=await dictionary.lookup('mot',async()=>r,signal());assert.equal(v.status,r.statusCode===404?'not-found':'unavailable');assert.deepEqual(v.glosses,[])
 }
})
test('dictionary Remote fetches without lexicon writes and rejects arbitrary request fields',async()=>{
 const backing=createBacking();const {controller}=await openController(backing,FRENCH_READER_DOMAIN,{services:{web:{fetch:async()=>response()}}})
 const before=backing.writes.length
 assert.equal((await controller.quickDictionaryRemote({mot:'préféré',partOfSpeech:null},signal())).status,'found')
 assert.equal(backing.writes.length,before)
 assert.equal((await controller.lookupMotRemote({mot:'préféré',partOfSpeech:null},signal())).found,false)
 await assert.rejects(()=>controller.quickDictionaryRemote({mot:'préféré',partOfSpeech:null,url:'https://example.com'},signal()),e=>e.code==='gateway/bad-request')
})

test('quick lookup gives Chinese form explanations without model or translation calls', async () => {
 const dictionary=new QuickDictionary();let calls=0
 const v=await dictionary.lookup('ait',async()=>{calls++;return response({fr:[{language:'French',partOfSpeech:'Verb',definitions:[{definition:'third-person singular present subjunctive of avoir'}]}]})},signal())
 assert.equal(calls,1)
 assert.equal(v.glosses[0].text,'avoir 的虚拟式现在时第三人称单数形式')
})
test('other dictionary meanings use Chinese translation and reject English or quota failures', async () => {
 for(const translated of ['建筑；房屋','building','MYMEMORY WARNING']) {
  const v=await new QuickDictionary().lookup('maison',async(url)=>url.includes('wiktionary')?response({fr:[{language:'French',partOfSpeech:'Noun',definitions:[{definition:'a building'}]}]}):response({responseStatus:200,responseData:{translatedText:translated}}),signal())
  assert.equal(v.status,translated==='建筑；房屋'?'found':'unavailable')
  if(v.status==='found') assert.equal(v.glosses[0].text,translated)
 }
})

test('translation boilerplate cannot disguise an English meaning as Chinese', async () => {
 for(const translation of ['法语名词bibliothèque的意思是： library','法语名词bibliothèque的意思是：图书馆']) {
  const value=await new QuickDictionary().lookup('bibliothèque',async url=>url.includes('wiktionary')?response({fr:[{language:'French',partOfSpeech:'Noun',definitions:[{definition:'library'}]}]}):response({responseStatus:200,responseData:{translatedText:translation}}),signal())
  assert.equal(value.status,translation.endsWith('library')?'unavailable':'found')
  if(value.status==='found')assert.equal(value.glosses[0].text,'图书馆')
 }
})
