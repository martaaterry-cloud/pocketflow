/**
 * Utilidades de control de scroll y navegación para PocketFlow.
 */

/**
 * Resetea el scroll de forma instantánea al inicio de la página y de cualquier contenedor scrollable.
 */
export function scrollToTop(): void {
  if (typeof window !== 'undefined') {
    // 1. Reset standard window/document scroll
    try {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior })
    } catch {
      window.scrollTo(0, 0)
    }

    if (document.documentElement && document.documentElement.scrollTop !== 0) {
      document.documentElement.scrollTop = 0
    }
    if (document.body && document.body.scrollTop !== 0) {
      document.body.scrollTop = 0
    }

    // 2. Reset app containers if scrollable
    const appShell = document.querySelector('.app-shell')
    if (appShell && appShell.scrollTop !== 0) {
      appShell.scrollTop = 0
    }

    const page = document.querySelector('.page')
    if (page && page.scrollTop !== 0) {
      page.scrollTop = 0
    }

    const main = document.querySelector('main')
    if (main && main.scrollTop !== 0) {
      main.scrollTop = 0
    }

    const root = document.getElementById('root')
    if (root && root.scrollTop !== 0) {
      root.scrollTop = 0
    }
  }
}

/**
 * Lógica pura para determinar la acción al pulsar la pestaña 'Más' en la barra inferior.
 * - Si la pestaña activa ya es 'más' y subView !== 'menu', resetea subView a 'menu' y scroll arriba.
 * - Si la pestaña activa ya es 'más' y subView === 'menu', permanece en 'menu' y resetea scroll arriba.
 * - Si la pestaña activa es otra, cambia a 'más', subView 'menu' y resetea scroll arriba.
 */
export function resolveMoreTabPress(currentTab: string, currentSubView: string): {
  nextTab: 'more'
  nextSubView: 'menu'
  shouldResetScroll: boolean
} {
  return {
    nextTab: 'more',
    nextSubView: 'menu',
    shouldResetScroll: true,
  }
}
