// Run this read-only expression in a browser with a reader dialog open.
// The application viewport may be larger than the embedded plugin panel.
(() => {
  const root = document.querySelector('.fr-root.bookLayout')
  const modal = root?.querySelector('.modal')
  const backdrop = root?.querySelector('.modalBackdrop')
  if (!modal || !backdrop) throw new Error('Open a reader dialog before checking layout')
  const area = root.getBoundingClientRect()
  const within = (box) => box.left >= area.left - 1 && box.right <= area.right + 1
    && box.top >= area.top - 1 && box.bottom <= area.bottom + 1
  if (!within(modal.getBoundingClientRect()) || !within(backdrop.getBoundingClientRect())) throw new Error('Dialog extends outside the plugin panel')
  if (modal.scrollWidth > modal.clientWidth + 1) throw new Error('Dialog has horizontal overflow')
  for (const field of modal.querySelectorAll('input, textarea, select')) {
    const box = field.getBoundingClientRect(), bounds = modal.getBoundingClientRect()
    if (box.left < bounds.left - 1 || box.right > bounds.right + 1) throw new Error('Dialog field extends beyond its horizontal edge')
  }
  return { panel: `${Math.round(root.clientWidth)}x${Math.round(root.clientHeight)}`, passed: true,
    scrollable: modal.scrollHeight > modal.clientHeight }
})()
