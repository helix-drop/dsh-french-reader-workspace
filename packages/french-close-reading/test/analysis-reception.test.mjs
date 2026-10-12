import test from 'node:test'
import assert from 'node:assert/strict'
import { sourceTokens, extractAnalysisObject } from '../lib/analysis-reception.js'
import { parseAnalysisReply, putSentenceAnalysis, readSentenceAnalyses } from '../lib/analysis-store.js'
import { SentenceAnalysisSchema, analysisCoverage, validateSentenceAnalysis } from '../lib/analysis.js'
import { createBacking, ids, openController, passageRequest, signal } from './support/harness.mjs'
import { FRENCH_READER_DOMAIN } from '../lib/domain.js'
const input = text => ({ passageId: ids.passage, anchorId: 'p1.s1', text, sourceRevision: 1, segmentationRevision: 1, backend: 'stub', model: 'test', allowPartial: true })
const parse = (text, clauses, constituents, extra = {}) => parseAnalysisReply(JSON.stringify({ translation: '测试译文', backbone: '', clauses, constituents, morphology: [], explanations: [], ...extra }), input(text))
const main = text => ({ id: 'c1', role: '主句', text, start: 0, end: text.length, parentId: null })

test('token anchors preserve elision punctuation and surrogate-pair offsets', () => {
  const text = '😀 L’ami dit : je viens.'
  const tokens = sourceTokens(text)
  assert.equal(tokens[0].end, 2)
  for (const t of tokens) assert.equal(text.slice(t.start,t.end),t.text)
  const part = tokens.find(t=>t.text==='je')
  const result = parse(text,[main(text)],[{role:'主语',text:'je',startToken:part.id,endToken:part.id,clauseId:'c1'}])
  assert.equal(result.analysis.constituents[0].start, text.indexOf('je'))
  assert.equal(result.analysis.reception.tokenRanges,1)
  assert.ok(SentenceAnalysisSchema.safeParse(result.analysis).success)
})
test('repeated quotes resolve within their named clause rather than the whole sentence', () => {
  const text='Je dis que je viens et que je pars.'
  const quote='que je pars',start=text.indexOf(quote)
  const result=parse(text,[main(text),{id:'c2',role:'补语从句',text:quote,start,end:start+quote.length,parentId:'c1'}],[{role:'主语',text:'je',start:900,end:902,clauseId:'c2'}])
  assert.equal(result.analysis.constituents[0].start,text.lastIndexOf('je'))
  assert.ok(!result.analysis.reception.issues.some(i=>i.reason.includes('无法唯一定位')))
})
test('word boundaries do not confuse on with circulation',()=>{
  const text='La circulation continue et on avance.'
  const result=parse(text,[main(text)],[{role:'主语',text:'on',start:999,end:1001,clauseId:'c1'}])
  assert.equal(result.analysis.constituents[0].start,text.indexOf('on avance'))
})
test('ambiguous quotes remain pending and valid spans stay readable',()=>{
  const text='Je dis que je viens et que je pars.'
  const result=parse(text,[main(text)],[{role:'主语',text:'je',clauseId:'c1'},{role:'变位动词',text:'dis',clauseId:'c1'}])
  assert.equal(result.analysis.reception.state,'partial')
  assert.equal(result.analysis.constituents.length,1)
  assert.equal(result.analysis.reception.issues[0].text,'je')
  assert.deepEqual(validateSentenceAnalysis(result.analysis,text).errors,[])
  const coverage=analysisCoverage([{id:'p1.s1',text}],[result.analysis])
  assert.deepEqual(coverage.covered,[])
  assert.deepEqual(coverage.failed,['p1.s1'])
})
test('explicit occurrence resolves repetition without guessing from nearby offsets',()=>{
  const text='je viens et je pars.'
  const result=parse(text,[main(text)],[{role:'主语',text:'je',occurrence:2,clauseId:'c1'}])
  assert.equal(result.analysis.constituents[0].start,text.lastIndexOf('je'))
})
test('mismatched token anchors never highlight a different quote',()=>{
  const text='je viens et je pars.'
  const result=parse(text,[main(text)],[{role:'主语',text:'je',startToken:2,endToken:2,clauseId:'c1'}])
  assert.equal(result.analysis.constituents.length,0)
  assert.equal(result.analysis.reception.state,'partial')
})
test('cyclic clauses and dependent constituents are omitted rather than promoted to roots',()=>{
  const text='Je viens.'
  const result=parse(text,[{...main(text),parentId:'c2'},{...main(text),id:'c2',parentId:'c1'}],[{role:'主语',text:'Je',clauseId:'c1'}])
  assert.equal(result.analysis.clauses.length,0)
  assert.equal(result.analysis.constituents.length,0)
  assert.ok(result.analysis.reception.issues.some(i=>i.reason.includes('循环')))
})
test('missing references and duplicate identifiers are pending rather than guessed',()=>{
  const text='Je viens.'
  for(const clauses of [[{...main(text),parentId:'absent'}],[main(text),main(text)]]) {
    const result=parse(text,clauses,[{role:'主语',text:'Je',clauseId:'c1'}])
    assert.equal(result.analysis.reception.state,'partial')
    assert.equal(result.analysis.clauses.length,0)
  }
})
test('mixed JSON and grammar blocks with braces inside strings extract one complete analysis',()=>{
  const first={translation:'译文含 {词} 和转义符 \\"',clauses:[],constituents:[]}
  assert.deepEqual(extractAnalysisObject('说明\n```json\n'+JSON.stringify(first)+'\n```\nGRAMMAR\n'+JSON.stringify({terms:['x']})),first)
  assert.equal(extractAnalysisObject('{"translation":"截断'),null)
})
test('invented and discontinuous quotes are not matched approximately',()=>{
  const text='Je ne viens jamais.'
  const result=parse(text,[main(text)],[{role:'变位动词',text:'Je viens',clauseId:'c1'}])
  assert.equal(result.analysis.constituents.length,0)
  assert.ok(result.analysis.reception.issues.some(i=>i.reason.includes('无法唯一定位')))
})
test('strict manual import remains strict and invalid explanation offsets lose only their anchors',()=>{
  const text='Je viens.'
  const reply=JSON.stringify({translation:'我来。',clauses:[main(text)],constituents:[{text:'absent',clauseId:'c1'}]})
  const result=parseAnalysisReply(reply,{...input(text),allowPartial:false})
  assert.equal(result.ok,false)
  const result2=parse(text,[main(text)],[{role:'主语',text:'Je',clauseId:'c1'}],{explanations:[{kind:'context',text:'说明',start:99,end:200}]})
  assert.equal(result2.analysis.explanations[0].start,null)
})
test('partial result survives schema-checked controller reopen and retains earlier complete snapshot',async()=>{
  const text='Je viens.'
  const backing=createBacking()
  const backend={id:'stub',label:'stub',capabilities:{streaming:false,cancel:true,reportsResolvedModel:true,reportsUsage:true,maxInputCharacters:null,singleFlight:false},available:()=>({available:true}),generate:async()=>({text:JSON.stringify({translation:'我来。',clauses:[main(text)],constituents:[{role:'主语',text:'inexistant',clauseId:'c1'}]}),resolvedModel:'test',usage:null,finish:'stop',failure:null})}
  let opened=await openController(backing,FRENCH_READER_DOMAIN,{backends:[backend]})
  await opened.controller.createPassage({...passageRequest,sourceText:text},signal())
  const full=parse(text,[main(text)],[{role:'主语',text:'Je',clauseId:'c1'},{role:'变位动词',text:'viens',clauseId:'c1'}]).analysis
  const partial=parse(text,[main(text)],[{role:'主语',text:'inexistant',clauseId:'c1'}]).analysis
  // Exercise the actual domain table using the controller's direct store facade.
  assert.equal((await opened.controller.putSentenceAnalysisRemote({passageId:ids.passage,anchorId:'p1.s1',analysisJson:JSON.stringify({translation:'我来。',clauses:[main(text)],constituents:[{role:'主语',text:'Je',clauseId:'c1'}]})},signal())).stored,true)
  const generated=await opened.controller.analyseSentence({passageId:ids.passage,anchorId:'p1.s1',backend:'stub',model:'test',operationId:globalThis.crypto.randomUUID()},signal())
  assert.equal(generated.ok,true)
  assert.equal(generated.covered,0)
  await opened.domain.close()
  opened=await openController(backing,FRENCH_READER_DOMAIN)
  const restored=opened.controller.readSentenceAnalysis(ids.passage,'p1.s1',signal())
  assert.equal(restored.analysis.translation,'我来。')
  assert.equal(restored.analysis.reception.state,'partial')
  assert.ok(restored.hints.some(h=>h.startsWith('部分解析')))
  // Snapshot preservation at the store layer, with serializable records.
  const records=new Map(),table={get:key=>records.get(key),put:async(key,value)=>{records.set(key,structuredClone(value))}}
  assert.equal((await putSentenceAnalysis(table,full,text)).stored,true)
  assert.equal((await putSentenceAnalysis(table,partial,text)).stored,true)
  assert.ok([...records.keys()].some(key=>key.includes('_history_')))
  assert.equal(readSentenceAnalyses(table,ids.passage).sentences[0].reception.state,'partial')
  await opened.domain.close()
})


test('a valid object with a missing translation reports incomplete rather than invalid JSON',()=>{
  const result=parseAnalysisReply('{"clauses":[],"constituents":[]}',input('Je viens.'))
  assert.equal(result.ok,false)
  assert.equal(result.reason,'analysis-incomplete')
})


test('real model elision spacing is typography and preserves original highlighting',()=>{
  const text='Les hypothèses n’étoient pas capables de l’ébranler.'
  const result=parse(text,[main(text)],[{role:'变位动词',text:'n ’ étoient pas',clauseId:'c1'},{role:'不定式补语',text:'de l ’ ébranler',clauseId:'c1'}])
  assert.equal(result.analysis.constituents[0].text,'n’étoient pas')
  assert.equal(result.analysis.constituents[1].text,'de l’ébranler')
  assert.ok(!result.analysis.reception.issues.some(i=>i.reason.includes('无法唯一定位')))
})
test('elision spacing tolerance still refuses inserted words and ambiguous repetitions',()=>{
  const text='l’ami lit et l’ami rit.'
  const result=parse(text,[main(text)],[{role:'主语',text:'l ’ ami',clauseId:'c1'},{role:'主语',text:'L ’ ami heureux',clauseId:'c1'}])
  assert.equal(result.analysis.constituents.length,0)
})
