// Read-only browser assertion. Open the real reader and route, then evaluate
// this function in the page. This checks rendered geometry and hit testing,
// rather than accepting the presence of a CSS declaration as proof.
() => {
  const root = document.querySelector('.fr-root.bookLayout')
  const workspace = root?.querySelector('.workspace')
  const route = root?.querySelector('.navigation:not(.closed)')
  if (!root || !workspace || !route) throw new Error('Open a passage and its route before checking layout')
  const box = route.getBoundingClientRect()
  const area = workspace.getBoundingClientRect()
  const within = (inner, outer) => inner.left >= outer.left - 1 && inner.right <= outer.right + 1
    && inner.top >= outer.top - 1 && inner.bottom <= outer.bottom + 1
  if (!within(box, area)) throw new Error('Route extends outside the reading workspace')
  if (box.width < Math.min(280, area.width) || box.height < 120) throw new Error('Route has no usable area')
  for (const button of route.querySelectorAll('.navHead button, .navFoot button')) {
    const bounds = button.getBoundingClientRect()
    if (!within(bounds, box)) throw new Error(`Route control is clipped: ${button.textContent}`)
    const hit = document.elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2)
    if (!button.contains(hit)) throw new Error(`Route control is covered: ${button.textContent}`)
  }
  const stage = route.querySelector('.navStage').getBoundingClientRect()
  if (stage.width < 1 || stage.height < 1) throw new Error('Route canvas is collapsed')
  const x = Math.max(stage.left + 1, Math.min(stage.right - 1, stage.left + 30))
  const y = Math.max(stage.top + 1, Math.min(stage.bottom - 1, stage.top + 30))
  if (!route.contains(document.elementFromPoint(x, y))) throw new Error('Route canvas is covered by another layer')
  return { panel: `${Math.round(root.clientWidth)}x${Math.round(root.clientHeight)}`,
    directory: root.dataset.directory, routeWidth: Math.round(box.width), stageHeight: Math.round(stage.height), passed: true }
}
