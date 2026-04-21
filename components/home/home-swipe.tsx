'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { motion, AnimatePresence, type PanInfo } from 'framer-motion'
import { useHomeEvent } from './home-event-context'

/** px of drag required to commit a panel switch. */
const SWIPE_OFFSET_THRESHOLD = 70
/** |velocity| in px/s to commit regardless of offset (fast flick). */
const SWIPE_VELOCITY_THRESHOLD = 450

/**
 * Slide-and-fade variants, driven by `direction` (+1 = swiped right-to-left
 * moving to the NEXT event, -1 = left-to-right moving to the PREVIOUS).
 *
 * The enter direction matches the drag direction so motion feels continuous
 * with the user's finger: drag left → old panel flies left, new panel
 * arrives from the right.
 */
const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? 80 : dir < 0 ? -80 : 0, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? -80 : dir < 0 ? 80 : 0, opacity: 0 }),
}

/**
 * HomeSwipe — wraps the current HomePanel with a horizontal drag gesture
 * and an AnimatePresence slide transition.
 *
 * Design choices:
 *   - Only the current panel is mounted (no neighbour prefetch). Keeps
 *     Supabase quiet and memory small; animation covers the gap.
 *   - `dragDirectionLock` lets vertical scrolling win when the user's
 *     gesture is mostly vertical — no scroll hijack.
 *   - Panel switches via the pill rail also go through the same
 *     AnimatePresence transition; direction is inferred from the
 *     viewedIndex delta via a ref so taps animate too.
 *   - Single-event users get a straight pass-through with no gesture.
 */
export function HomeSwipe({ children }: { children: ReactNode }) {
  const { viewedIndex, availableEvents, goToIndex } = useHomeEvent()
  const prevIndexRef = useRef(viewedIndex)
  const direction =
    viewedIndex > prevIndexRef.current
      ? 1
      : viewedIndex < prevIndexRef.current
      ? -1
      : 0

  useEffect(() => {
    prevIndexRef.current = viewedIndex
    // Reset scroll so the new panel reads from the top — otherwise the user
    // can end up mid-panel on a fresh event, which feels weird.
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'auto' })
    }
  }, [viewedIndex])

  if (availableEvents.length <= 1) {
    return <>{children}</>
  }

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const offset = info.offset.x
    const velocity = info.velocity.x
    const committed =
      Math.abs(offset) > SWIPE_OFFSET_THRESHOLD ||
      Math.abs(velocity) > SWIPE_VELOCITY_THRESHOLD
    if (!committed) return
    // Swipe LEFT (offset < 0) → next event
    if (offset < 0 && viewedIndex < availableEvents.length - 1) {
      // Tiny haptic cue on supported devices. Bail silently if not available.
      try {
        navigator.vibrate?.(8)
      } catch {
        /* noop */
      }
      goToIndex(viewedIndex + 1)
    } else if (offset > 0 && viewedIndex > 0) {
      try {
        navigator.vibrate?.(8)
      } catch {
        /* noop */
      }
      goToIndex(viewedIndex - 1)
    }
  }

  return (
    <AnimatePresence mode="wait" initial={false} custom={direction}>
      <motion.div
        key={viewedIndex}
        custom={direction}
        variants={slideVariants}
        initial="enter"
        animate="center"
        exit="exit"
        transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
        drag="x"
        dragDirectionLock
        dragElastic={0.18}
        dragConstraints={{ left: 0, right: 0 }}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        // Don't let the drag swallow taps on links/buttons inside the panel.
        // Framer-motion keeps clicks if the pointer didn't move beyond its
        // drag threshold (~3px), which is what we want.
        className="touch-pan-y"
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}
