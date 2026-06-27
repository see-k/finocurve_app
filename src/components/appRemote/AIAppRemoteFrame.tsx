import { useEffect, useRef, useState } from 'react'
import styles from './AIAppRemoteFrame.module.css'
import { formatRemoteToolLabel, nextRemoteIndicatorDepth } from './remoteIndicatorHelpers'

export default function AIAppRemoteFrame() {
  const depthRef = useRef(0)
  const [active, setActive] = useState(false)
  const [toolName, setToolName] = useState<string | undefined>(undefined)

  useEffect(() => {
    const subscribe = window.electronAPI?.onAppBrowserRemoteIndicator
    if (!subscribe) return undefined

    return subscribe((payload) => {
      if (payload.phase === 'start') {
        depthRef.current = nextRemoteIndicatorDepth(depthRef.current, 'start').depth
        setToolName(payload.toolName)
        setActive(true)
      } else {
        const next = nextRemoteIndicatorDepth(depthRef.current, 'end')
        depthRef.current = next.depth
        setActive(next.active)
        if (next.clearToolName) {
          setToolName(undefined)
        }
      }
    })
  }, [])

  const label = formatRemoteToolLabel(toolName)

  return (
    <div className={styles.root} data-active={active} aria-hidden="true">
      {/* Outer glow layer */}
      <div className={styles.outerGlow} />

      {/* Primary animated border */}
      <div className={styles.borderTop} />
      <div className={styles.borderRight} />
      <div className={styles.borderBottom} />
      <div className={styles.borderLeft} />

      {/* Light runners traveling along edges */}
      <div className={`${styles.runner} ${styles.runnerTop}`} />
      <div className={`${styles.runner} ${styles.runnerRight}`} />
      <div className={`${styles.runner} ${styles.runnerBottom}`} />
      <div className={`${styles.runner} ${styles.runnerLeft}`} />

      {/* Corner brackets — large, dramatic */}
      <div className={`${styles.bracket} ${styles.bracketTL}`} />
      <div className={`${styles.bracket} ${styles.bracketTR}`} />
      <div className={`${styles.bracket} ${styles.bracketBL}`} />
      <div className={`${styles.bracket} ${styles.bracketBR}`} />

      {/* Corner dots */}
      <div className={`${styles.dot} ${styles.dotTL}`} />
      <div className={`${styles.dot} ${styles.dotTR}`} />
      <div className={`${styles.dot} ${styles.dotBL}`} />
      <div className={`${styles.dot} ${styles.dotBR}`} />

      {/* Horizontal scan line */}
      <div className={styles.scanH} />

      {/* Vertical scan line */}
      <div className={styles.scanV} />

      {/* Inner vignette glow */}
      <div className={styles.vignette} />

      {/* Status label */}
      <div className={styles.labelWrap}>
        <span className={styles.labelIcon}>&#x25C8;</span>
        <span className={styles.labelText}>AI Remote&ensp;·&ensp;{label}</span>
      </div>
    </div>
  )
}
