import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const source = readFileSync(new URL('../client.js', import.meta.url), 'utf8')
const body = source.slice(source.indexOf('    function backboneStructure('), source.indexOf('    function markdownInline('))
const plan = vm.runInNewContext(`${body}\nbackboneStructure`)
const span = (id, role, start, end, parentId = null) => ({ id, role, start, end, parentId })

test('main clause comes first and both nested relatives remain under their own clauses', () => {
  const text = 'When A who reads, B knows that C who writes acts.'
  const clauses = [span('time', '时间从句', 0, 16), span('r1', '关系从句', 7, 16, 'bad'),
    span('main', '主句', 17, text.length), span('object', '补语从句', 25, text.length, 'main'),
    span('r2', '关系从句', 32, 42, 'object')]
  const tree = plan({ text, clauses })
  assert.equal(tree[0].id, 'main')
  assert.equal(tree[0].children[0].id, 'object')
  assert.equal(tree[0].children[0].children[0].id, 'r2')
  assert.equal(tree[1].children[0].id, 'r1')
  assert.ok(tree[0].core.some(x => x.omitted))
  for (const node of [tree[0], tree[0].children[0], tree[1]]) {
    for (const piece of node.core.filter(x => !x.omitted)) assert.equal(piece.text, text.slice(piece.start, piece.end))
  }
})

test('invalid spans, duplicate spans and cyclic parent IDs cannot hide or loop valid clauses', () => {
  const tree = plan({ text: 'A reads.', clauses: [span('main', '主句', 0, 8, 'child'),
    span('child', '从句', 2, 7, 'main'), span('dup', '从句', 2, 7), span('bad', '从句', -1, 20)] })
  assert.equal(tree.length, 1)
  assert.equal(tree[0].children.length, 1)
  assert.equal(tree[0].text, 'A reads.')
})

test('crossing ranges keep the complete parent text instead of silently dropping words', () => {
  const tree = plan({ text: 'abcdefghij', clauses: [span('main', '主句', 0, 10), span('a', '从句', 1, 6), span('b', '从句', 4, 9)] })
  assert.equal(tree[0].core.length, 1)
  assert.equal(tree[0].core[0].text, 'abcdefghij')
  assert.equal(tree[0].children.length, 2)
})

test('coordinated main clauses stay in source order and a legacy record yields an empty tree', () => {
  const tree = plan({ text: 'A reads; B writes.', clauses: [span('b', '主句', 9, 18), span('a', '主句', 0, 8)] })
  assert.equal(tree.map(x => x.id).join(','), 'a,b')
  assert.equal(plan({ text: 'Old analysis' }).length, 0)
})
