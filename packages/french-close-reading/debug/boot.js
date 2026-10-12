/* Browser debug host for the French close-reading panel.
   The same client.js fills the window. Calls go to this page's origin, and
   debug/server.mjs forwards them to the already-running desktop host. */
const DEBUG_CHROME_KEY = 'french-close-reading/debug-desktop-chrome'
const React = window.React
const ReactDOM = window.ReactDOM
const h = React.createElement
const { useState } = React

const bridge = { onClose() {} }
const dictionaries = { zh: {}, en: {} }
const frenchReader = {}
let mainPanel = null

function showFailure(error) {
  const app = document.getElementById('app')
  if (app === null) return
  const message = error instanceof Error ? error.message : '调试入口没有打开'
  console.error('[french-debug]', error)
  app.replaceChildren()
  const p = document.createElement('p')
  p.className = 'fcr-debug-fail'
  p.textContent = message
  app.appendChild(p)
}

function packCall(descriptor, values) {
  const expected = descriptor.parameters.length
  let signal
  let business = values
  if (descriptor.cancellation !== undefined && values.length === expected + 1) {
    const last = values[values.length - 1]
    if (typeof AbortSignal !== 'undefined' && last instanceof AbortSignal) {
      signal = last
      business = values.slice(0, expected)
    }
  }
  const args = {}
  descriptor.parameters.forEach((parameter, index) => {
    const value = business[index]
    if (value !== undefined) args[parameter.wire] = value
  })
  return { args, signal }
}

async function callFrenchReader(endpoint, args, signal) {
  const rpcId = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `debug-${Date.now()}`
  const response = await fetch(`/api/${endpoint}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId,
      method: endpoint,
      payload: { args },
    }),
    signal,
  })
  const text = await response.text()
  let parsed = null
  try { parsed = JSON.parse(text) } catch { parsed = null }
  if (parsed === null || parsed.type !== 'server-response' || parsed.result === undefined) {
    throw new Error(response.status === 401 || response.status === 403
      ? '桌面宿主拒绝了这次调试请求'
      : `调试代理没有返回可用结果 (${response.status})`)
  }
  return parsed.result
}

function installMethod(descriptor) {
  const endpoint = `${descriptor.namespace}/${descriptor.method}`
  if (descriptor.mode === 'stream') {
    frenchReader[descriptor.method] = async function* streamCall(...values) {
      if (descriptor.method !== 'streamAsk') {
        throw new Error(`调试入口还不能流转 ${descriptor.method}`)
      }
      const packed = packCall(descriptor, values)
      const result = await callFrenchReader('frenchReader/ask', packed.args, packed.signal)
      if (result === null || result.ok !== true) {
        throw new Error(result?.error?.message ?? '提问没有返回结果')
      }
      yield { kind: 'done', result: result.value }
    }
    return
  }
  frenchReader[descriptor.method] = (...values) => {
    const packed = packCall(descriptor, values)
    return callFrenchReader(endpoint, packed.args, packed.signal)
  }
}

const host = {
  effect(factory) { return factory() },
  locale: {
    register(_namespace, value) {
      dictionaries.zh = value?.zh ?? {}
      dictionaries.en = value?.en ?? {}
    },
    bind() {
      return (key) => dictionaries.zh[key] ?? key
    },
  },
  layout: {
    selectPanel() { bridge.onClose() },
  },
  slots: {
    inject(_name, register) { register() },
    register(meta, Component) {
      if (meta?.name === 'main') mainPanel = { meta, Component }
    },
  },
  remote: {
    frenchReader,
    async $mount(contribution) {
      for (const descriptor of contribution?.descriptors ?? []) installMethod(descriptor)
      return async () => {}
    },
  },
  plugin(definition) {
    const instance = typeof definition === 'function' ? { apply: definition } : definition
    const result = instance.apply(host)
    if (result !== undefined && typeof result.then === 'function') {
      throw new Error('调试入口只接住同步打开的面板')
    }
    return { dispose: async () => {} }
  },
}

function ClosedNotice({ onReopen }) {
  return h('div', { className: 'fcr-debug-closed' },
    h('p', null, '阅读面板已关闭'),
    h('button', { type: 'button', onClick: onReopen }, '重新打开'))
}

function DebugChrome({ desktop, onToggle }) {
  return h('div', { id: 'fcr-debug-bar' },
    h('span', null, '浏览器调试'),
    h('button', {
      type: 'button',
      'aria-pressed': desktop,
      'aria-label': '模拟 Mac 窗口顶栏遮挡',
      onClick: onToggle,
    }, desktop ? 'Mac 顶栏遮挡：开' : 'Mac 顶栏遮挡：关'))
}

function TrafficLights() {
  return h('div', { className: 'fcr-debug-lights', 'aria-hidden': 'true' },
    h('span'), h('span'), h('span'))
}

function DebugShell({ face, Component }) {
  const [desktop, setDesktop] = useState(() => {
    try { return localStorage.getItem(DEBUG_CHROME_KEY) === '1' } catch { return false }
  })
  const [generation, setGeneration] = useState(0)
  const [closed, setClosed] = useState(false)
  window.__FCR_DEBUG_DESKTOP__ = desktop
  bridge.onClose = () => setClosed(true)
  const toggle = () => {
    const next = !desktop
    try { localStorage.setItem(DEBUG_CHROME_KEY, next ? '1' : '0') } catch { /* this session still toggles */ }
    setDesktop(next)
  }
  return h(React.Fragment, null,
    closed
      ? h(ClosedNotice, { onReopen: () => { setClosed(false); setGeneration((current) => current + 1) } })
      : h(Component, { ...face, key: generation }),
    desktop ? h(TrafficLights) : null,
    h(DebugChrome, { desktop, onToggle: toggle }))
}

async function start(registration) {
  if (typeof ReactDOM?.createRoot !== 'function') {
    throw new Error('调试页没有载入 React')
  }
  const plugin = registration.factory((id) => {
    if (id === 'react') return React
    throw new Error(`调试页不能提供模块 ${id}`)
  })
  await plugin.apply(host)
  if (mainPanel === null) throw new Error('阅读面板没有注册到调试页')
  const face = mainPanel.meta.inject()
  ReactDOM.createRoot(document.getElementById('app')).render(
    h(DebugShell, { face, Component: mainPanel.Component }),
  )
}

window.__ModuleLoader__ = {
  load(registration) {
    if (window.__fcrDebugStarting === true) return
    window.__fcrDebugStarting = true
    queueMicrotask(() => { start(registration).catch(showFailure) })
  },
}

window.addEventListener('error', (event) => {
  if (document.querySelector('.fr-root') !== null) return
  showFailure(event.error ?? new Error('调试页脚本没有跑起来'))
})
