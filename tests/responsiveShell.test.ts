import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DesktopSidebar, type DesktopSidebarProps } from '../src/components/DesktopSidebar'
import { APP_VERSION, APP_BUILD } from '../src/version'
import * as fs from 'node:fs'
import * as path from 'node:path'

describe('Fase 77 — Adaptive App Shell & Desktop Navigation (>= 840px)', () => {
  // 1. DesktopSidebar renderiza las vistas principales
  it('1. DesktopSidebar contiene enlaces para Inicio, Movimientos, Calendario y Ahorro', () => {
    const props: DesktopSidebarProps = {
      activeTab: 'home',
      moreSubView: 'menu',
      onTabChange: () => {},
      onSubViewChange: () => {},
      onOpenAdd: () => {},
      syncStatus: 'up_to_date',
    }

    const html = renderToStaticMarkup(React.createElement(DesktopSidebar, props))
    assert.ok(html.includes('Inicio'))
    assert.ok(html.includes('Movimientos'))
    assert.ok(html.includes('Calendario'))
    assert.ok(html.includes('Ahorro e inversión'))
  })

  // 2. DesktopSidebar contiene accesos directos a Plan financiero, Cobros y Recurrentes
  it('2. DesktopSidebar expone accesos directos a Plan financiero, Cobros y deudas y Gastos recurrentes', () => {
    const props: DesktopSidebarProps = {
      activeTab: 'home',
      moreSubView: 'menu',
      onTabChange: () => {},
      onSubViewChange: () => {},
      onOpenAdd: () => {},
      syncStatus: 'up_to_date',
    }

    const html = renderToStaticMarkup(React.createElement(DesktopSidebar, props))
    assert.ok(html.includes('Plan financiero'))
    assert.ok(html.includes('Cobros y deudas'))
    assert.ok(html.includes('Gastos recurrentes'))
  })

  // 3. Estado activo correcto para subview "plan"
  it('3. Subview Plan financiero se marca como activa cuando tab=more y moreSubView=plan', () => {
    const props: DesktopSidebarProps = {
      activeTab: 'more',
      moreSubView: 'plan',
      onTabChange: () => {},
      onSubViewChange: () => {},
      onOpenAdd: () => {},
      syncStatus: 'up_to_date',
    }

    const html = renderToStaticMarkup(React.createElement(DesktopSidebar, props))
    assert.ok(html.includes('desktop-nav-item active'), 'Debe existir un elemento de navegación activo')
    assert.ok(html.includes('Plan financiero'))
  })

  // 4. Estado activo correcto para subview "receivables"
  it('4. Subview Cobros y deudas se marca como activa cuando tab=more y moreSubView=receivables', () => {
    const props: DesktopSidebarProps = {
      activeTab: 'more',
      moreSubView: 'receivables',
      onTabChange: () => {},
      onSubViewChange: () => {},
      onOpenAdd: () => {},
      syncStatus: 'up_to_date',
    }

    const html = renderToStaticMarkup(React.createElement(DesktopSidebar, props))
    assert.ok(html.includes('desktop-nav-item active'))
    assert.ok(html.includes('Cobros y deudas'))
  })

  // 5. Botón de nuevo movimiento disponible en la barra lateral
  it('5. DesktopSidebar incluye botón de acción rápida "+ Nuevo movimiento"', () => {
    const props: DesktopSidebarProps = {
      activeTab: 'home',
      moreSubView: 'menu',
      onTabChange: () => {},
      onSubViewChange: () => {},
      onOpenAdd: () => {},
      syncStatus: 'connected',
    }

    const html = renderToStaticMarkup(React.createElement(DesktopSidebar, props))
    assert.ok(html.includes('btn-desktop-add-movement'))
    assert.ok(html.includes('Nuevo movimiento'))
  })

  // 6. No hay emojis en DesktopSidebar
  it('6. DesktopSidebar no contiene emojis en sus textos ni iconos', () => {
    const props: DesktopSidebarProps = {
      activeTab: 'home',
      moreSubView: 'menu',
      onTabChange: () => {},
      onSubViewChange: () => {},
      onOpenAdd: () => {},
      syncStatus: 'up_to_date',
      userDisplayName: 'Marta Terry',
    }

    const html = renderToStaticMarkup(React.createElement(DesktopSidebar, props))
    const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u
    assert.ok(!emojiRegex.test(html), 'No deben existir emojis en la barra lateral')
  })

  // 7. Limpieza de debug de attachments: no quedan strings [ATTACHMENT DEBUG] en el código fuente
  it('7. No quedan cadenas de log [ATTACHMENT DEBUG] en el código fuente de componentes ni store', () => {
    const filesToCheck = [
      path.join(process.cwd(), 'src', 'components', 'AttachmentSection.tsx'),
      path.join(process.cwd(), 'src', 'components', 'AddTransactionModal.tsx'),
      path.join(process.cwd(), 'src', 'store', 'useFinance.ts'),
    ]

    for (const f of filesToCheck) {
      if (fs.existsSync(f)) {
        const content = fs.readFileSync(f, 'utf-8')
        assert.ok(!content.includes('[ATTACHMENT DEBUG]'), `El archivo ${f} no debe contener [ATTACHMENT DEBUG]`)
        assert.ok(!content.includes('ERROR · [ETAPA:'), `El archivo ${f} no debe contener prefijos diagnósticos ERROR · [ETAPA:`)
      }
    }
  })

  // 8. Integración CSS desktop: el archivo desktop.css existe y contiene la regla @media (min-width: 840px) y (min-width: 1100px)
  it('8. desktop.css existe y contiene las reglas principales @media (min-width: 840px) y (min-width: 1100px)', () => {
    const desktopCssPath = path.join(process.cwd(), 'src', 'styles', 'desktop.css')
    assert.ok(fs.existsSync(desktopCssPath), 'src/styles/desktop.css debe existir')
    const content = fs.readFileSync(desktopCssPath, 'utf-8')
    assert.ok(content.includes('@media (min-width: 840px)'), 'desktop.css debe contener @media (min-width: 840px)')
    assert.ok(content.includes('@media (min-width: 1100px)'), 'desktop.css debe contener @media (min-width: 1100px)')
    assert.ok(content.includes('.desktop-sidebar'))
    assert.ok(content.includes('.main-content'))
  })

  // 9. Eliminación definitiva de la carcasa de 500px y regla 700px en styles.css
  it('9. styles.css ya no contiene la regla @media (min-width: 700px) ni max-width: 500px en app-shell ni bottom-nav', () => {
    const stylesCssPath = path.join(process.cwd(), 'src', 'styles.css')
    assert.ok(fs.existsSync(stylesCssPath), 'src/styles.css debe existir')
    const content = fs.readFileSync(stylesCssPath, 'utf-8')
    assert.ok(!content.includes('@media (min-width: 700px)'), 'styles.css no debe contener la regla @media (min-width: 700px)')
    assert.ok(!content.includes('max-width: 500px'), 'styles.css no debe contener max-width: 500px')
  })
})
