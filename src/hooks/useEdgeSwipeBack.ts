import { useEffect, useRef } from 'react'

interface UseEdgeSwipeBackOptions {
  onSwipeBack: () => void
  enabled?: boolean
  edgeThreshold?: number // px from left edge to begin swipe (default 28px)
  minDistance?: number   // minimum horizontal travel (default 75px)
  maxVerticalRatio?: number // max vertical travel vs horizontal (default 0.6)
}

export function useEdgeSwipeBack({
  onSwipeBack,
  enabled = true,
  edgeThreshold = 28,
  minDistance = 75,
  maxVerticalRatio = 0.6,
}: UseEdgeSwipeBackOptions) {
  const touchStartRef = useRef<{ x: number; y: number; isEdge: boolean; isCanceled: boolean } | null>(null)

  useEffect(() => {
    if (!enabled) return

    // Don't trigger if user prefers reduced motion or non-touch
    if (typeof window === 'undefined') return

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) {
        touchStartRef.current = null
        return
      }
      const touch = e.touches[0]
      const isEdge = touch.clientX <= edgeThreshold

      // Skip interactive inputs/sliders/segmented controls/horizontal sliders
      const target = e.target as HTMLElement | null
      const isInteractive = target?.closest('input[type="range"], .slider, .segmented-control, .transaction-row-swipeable, button')

      if (!isEdge || isInteractive) {
        touchStartRef.current = null
        return
      }

      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        isEdge: true,
        isCanceled: false,
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current || touchStartRef.current.isCanceled) return
      const touch = e.touches[0]
      const deltaX = touch.clientX - touchStartRef.current.x
      const deltaY = Math.abs(touch.clientY - touchStartRef.current.y)

      // If moving backwards (to the left), cancel
      if (deltaX < -5) {
        touchStartRef.current.isCanceled = true
        return
      }

      // If moving predominantly vertically, cancel to let page scroll
      if (deltaY > 20 && deltaY > deltaX * maxVerticalRatio) {
        touchStartRef.current.isCanceled = true
        return
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current || touchStartRef.current.isCanceled) {
        touchStartRef.current = null
        return
      }

      const touch = e.changedTouches[0]
      const deltaX = touch.clientX - touchStartRef.current.x
      const deltaY = Math.abs(touch.clientY - touchStartRef.current.y)

      if (deltaX >= minDistance && deltaY <= deltaX * maxVerticalRatio) {
        onSwipeBack()
      }

      touchStartRef.current = null
    }

    window.addEventListener('touchstart', handleTouchStart, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    window.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      window.removeEventListener('touchstart', handleTouchStart)
      window.removeEventListener('touchmove', handleTouchMove)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [enabled, onSwipeBack, edgeThreshold, minDistance, maxVerticalRatio])
}
