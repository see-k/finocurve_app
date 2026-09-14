import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Maximize2, Minus, Plus, RotateCcw } from 'lucide-react'
import {
  EXPOSURE_COLORS, EXPOSURE_LABELS, type CustodyMatrix, type ExposureKind,
} from '../../lib/enterpriseAnalytics'
import { formatCompactCurrency, formatCurrency, formatWeight } from '../../lib/formatMoney'
import './CustodyLandscape.css'

interface CustodyLandscapeProps {
  matrix: CustodyMatrix
  height?: number
}

/**
 * Axonometric projection parameters.
 *
 * Parallel, not perspective: a bar twice as tall draws twice as long on screen
 * wherever it sits in the field. Perspective would make depth distort value,
 * which is the usual reason a 3D chart lies.
 */
const TILT = 0.52
const CELL = 52
const BAR = 34
const MAX_BAR_HEIGHT = 240
/** Opens with the institution axis running mostly across the screen, so a wide
 *  panel is filled rather than leaving the field stranded in the middle. */
const DEFAULT_YAW = -0.42
const MIN_ZOOM = 0.6
const MAX_ZOOM = 5

interface Cell {
  row: number
  col: number
  institution: string
  exposure: ExposureKind
  value: number
}

interface ProjectedFace {
  points: string
  fill: string
  opacity: number
}

interface ProjectedBar {
  cell: Cell
  depth: number
  faces: ProjectedFace[]
  /** Screen position of the bar's top centre, for labels and tooltips. */
  topX: number
  topY: number
}

/** Face shading. One light source, so the solid reads as a solid. */
const FACE_LIGHT = { top: 1, left: 0.72, right: 0.52 }

function project(gx: number, gz: number, y: number, yaw: number) {
  const rx = gx * Math.cos(yaw) - gz * Math.sin(yaw)
  const rz = gx * Math.sin(yaw) + gz * Math.cos(yaw)
  return { x: rx * CELL, y: rz * CELL * TILT - y, depth: rz }
}

export default function CustodyLandscape({ matrix, height = 560 }: CustodyLandscapeProps) {
  const [yaw, setYaw] = useState(DEFAULT_YAW)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [hovered, setHovered] = useState<Cell | null>(null)
  const dragRef = useRef<
    { mode: 'rotate' | 'pan'; startX: number; startY: number; startYaw: number; startPan: { x: number; y: number } } | null
  >(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const [stageWidth, setStageWidth] = useState(900)
  /** viewBox units per CSS pixel at zoom 1, so panning tracks the cursor. */
  const viewportScaleRef = useRef(1)

  // The stage is fluid, so pixel-to-viewBox conversion has to follow its width.
  useEffect(() => {
    const el = stageRef.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      setStageWidth(entry.contentRect.width || 900)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const rows = matrix.rows.filter((row) => row.total > 0)
  const scale = matrix.peakCell > 0 ? MAX_BAR_HEIGHT / matrix.peakCell : 0

  const bars = useMemo<ProjectedBar[]>(() => {
    const out: ProjectedBar[] = []
    const halfRows = (rows.length - 1) / 2
    const halfCols = (matrix.exposures.length - 1) / 2

    rows.forEach((row, rowIndex) => {
      matrix.exposures.forEach((exposure, colIndex) => {
        const value = row.exposures[exposure]
        if (value <= 0) return

        const gx = rowIndex - halfRows
        const gz = colIndex - halfCols
        const barHeight = value * scale
        const half = (BAR / CELL) / 2

        // Four footprint corners, then the same four raised by the bar height.
        const footprint = [
          project(gx - half, gz - half, 0, yaw),
          project(gx + half, gz - half, 0, yaw),
          project(gx + half, gz + half, 0, yaw),
          project(gx - half, gz + half, 0, yaw),
        ]
        const roof = footprint.map((_, i) => {
          const corner = [
            [gx - half, gz - half], [gx + half, gz - half],
            [gx + half, gz + half], [gx - half, gz + half],
          ][i]
          return project(corner[0], corner[1], barHeight, yaw)
        })

        const base = EXPOSURE_COLORS[exposure]
        const faces: ProjectedFace[] = [
          {
            points: roof.map((p) => `${p.x},${p.y}`).join(' '),
            fill: base,
            opacity: FACE_LIGHT.top,
          },
        ]

        // Draw only the two side faces turned toward the viewer. Which pair that
        // is depends on yaw, so pick the two footprint edges with the greatest
        // screen depth and raise them into quads.
        for (let i = 0; i < 4; i++) {
          const a = footprint[i]
          const b = footprint[(i + 1) % 4]
          const ra = roof[i]
          const rb = roof[(i + 1) % 4]
          // An edge is visible when its outward normal faces the camera, which in
          // this projection reduces to the sign of the screen-space cross product.
          const facing = (b.x - a.x) * (ra.y - a.y) - (b.y - a.y) * (ra.x - a.x)
          if (facing <= 0) continue
          faces.push({
            points: `${a.x},${a.y} ${b.x},${b.y} ${rb.x},${rb.y} ${ra.x},${ra.y}`,
            fill: base,
            opacity: i % 2 === 0 ? FACE_LIGHT.left : FACE_LIGHT.right,
          })
        }

        const top = project(gx, gz, barHeight, yaw)
        out.push({
          cell: { row: rowIndex, col: colIndex, institution: row.label, exposure, value },
          depth: project(gx, gz, 0, yaw).depth,
          faces,
          topX: top.x,
          topY: top.y,
        })
      })
    })

    // Painter's algorithm: far cells first so near cells overlap them.
    return out.sort((a, b) => a.depth - b.depth)
  }, [rows, matrix.exposures, scale, yaw])

  const floor = useMemo(() => {
    const halfRows = (rows.length - 1) / 2
    const halfCols = (matrix.exposures.length - 1) / 2
    const pad = 0.62
    const corners = [
      project(-halfRows - pad, -halfCols - pad, 0, yaw),
      project(halfRows + pad, -halfCols - pad, 0, yaw),
      project(halfRows + pad, halfCols + pad, 0, yaw),
      project(-halfRows - pad, halfCols + pad, 0, yaw),
    ]
    const gridLines: { x1: number; y1: number; x2: number; y2: number }[] = []
    for (let r = 0; r < rows.length; r++) {
      const a = project(r - halfRows, -halfCols - pad, 0, yaw)
      const b = project(r - halfRows, halfCols + pad, 0, yaw)
      gridLines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
    }
    for (let c = 0; c < matrix.exposures.length; c++) {
      const a = project(-halfRows - pad, c - halfCols, 0, yaw)
      const b = project(halfRows + pad, c - halfCols, 0, yaw)
      gridLines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y })
    }
    return { outline: corners.map((p) => `${p.x},${p.y}`).join(' '), gridLines }
  }, [rows.length, matrix.exposures.length, yaw])

  const axisLabels = useMemo(() => {
    const halfRows = (rows.length - 1) / 2
    const halfCols = (matrix.exposures.length - 1) / 2

    // Screen direction of each grid axis. Labels are written along the axis they
    // do NOT enumerate, so neighbouring labels fan outward rather than collide.
    const along = (dx: number, dz: number) => {
      const a = project(0, 0, 0, yaw)
      const b = project(dx, dz, 0, yaw)
      let deg = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI
      let flipped = false
      // Keep text upright: past ±90° write it the other way and swap the anchor.
      if (deg > 90 || deg < -90) { deg += 180; flipped = true }
      return { deg, flipped }
    }

    const institutionAxis = along(0, 1)
    const exposureAxis = along(-1, 0)

    const institutions = rows.map((row, i) => {
      const p = project(i - halfRows, halfCols + 0.75, 0, yaw)
      return {
        key: row.key,
        text: row.label,
        x: p.x,
        y: p.y,
        rotate: institutionAxis.deg,
        anchor: (institutionAxis.flipped ? 'end' : 'start') as 'start' | 'end',
      }
    })

    const exposures = matrix.exposures.map((exposure, i) => {
      const p = project(-halfRows - 0.75, i - halfCols, 0, yaw)
      return {
        key: exposure,
        text: EXPOSURE_LABELS[exposure],
        x: p.x,
        y: p.y,
        rotate: exposureAxis.deg,
        anchor: (exposureAxis.flipped ? 'end' : 'start') as 'start' | 'end',
      }
    })

    return { institutions, exposures }
  }, [rows, matrix.exposures, yaw])

  const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z))

  const resetView = useCallback(() => {
    setYaw(DEFAULT_YAW)
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }, [])

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // Shift or middle button pans; a plain drag rotates.
    const mode = e.shiftKey || e.button === 1 ? 'pan' : 'rotate'
    dragRef.current = { mode, startX: e.clientX, startY: e.clientY, startYaw: yaw, startPan: pan }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [yaw, pan])

  const onPointerMove = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current
    if (!drag) return
    if (drag.mode === 'rotate') {
      setYaw(drag.startYaw + (e.clientX - drag.startX) * 0.006)
      return
    }
    // Pan in viewBox units, so a drag moves the field the same distance on
    // screen regardless of the current zoom.
    const perPixel = viewportScaleRef.current / zoom
    setPan({
      x: drag.startPan.x - (e.clientX - drag.startX) * perPixel,
      y: drag.startPan.y - (e.clientY - drag.startY) * perPixel,
    })
  }, [zoom])

  const onPointerUp = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    dragRef.current = null
    e.currentTarget.releasePointerCapture(e.pointerId)
  }, [])

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    // Only claim the wheel with a modifier held, so plain scrolling still moves
    // the page past this tall panel.
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) return
    e.preventDefault()
    setZoom((z) => clampZoom(z * (e.deltaY < 0 ? 1.12 : 1 / 1.12)))
  }, [])

  const onKeyDown = useCallback((e: React.KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowLeft') { setYaw((y) => y - 0.12); e.preventDefault() }
    if (e.key === 'ArrowRight') { setYaw((y) => y + 0.12); e.preventDefault() }
    if (e.key === '+' || e.key === '=') { setZoom((z) => clampZoom(z * 1.15)); e.preventDefault() }
    if (e.key === '-' || e.key === '_') { setZoom((z) => clampZoom(z / 1.15)); e.preventDefault() }
    if (e.key === 'Home' || e.key === '0') { resetView(); e.preventDefault() }
  }, [resetView])

  // Fit the viewBox to the geometry actually drawn, so rotating never leaves the
  // field stranded in dead space. Computed before the empty-state return so hook
  // order stays stable when balances load in.
  const viewBox = useMemo(() => {
    const xs: number[] = []
    const ys: number[] = []
    const note = (x: number, y: number) => { xs.push(x); ys.push(y) }

    for (const bar of bars) {
      for (const face of bar.faces) {
        for (const pair of face.points.split(' ')) {
          const [x, y] = pair.split(',').map(Number)
          note(x, y)
        }
      }
    }
    for (const pair of floor.outline.split(' ')) {
      const [x, y] = pair.split(',').map(Number)
      note(x, y)
    }
    // Reserve room for the rotated axis labels beyond the floor edge.
    const LABEL_RUN = 96
    for (const label of [...axisLabels.institutions, ...axisLabels.exposures]) {
      const rad = (label.rotate * Math.PI) / 180
      const dir = label.anchor === 'end' ? -1 : 1
      note(label.x, label.y)
      note(label.x + Math.cos(rad) * LABEL_RUN * dir, label.y + Math.sin(rad) * LABEL_RUN * dir)
    }

    if (xs.length === 0) return '-200 -200 400 400'
    const pad = 16
    const minX = Math.min(...xs) - pad
    const maxX = Math.max(...xs) + pad
    const minY = Math.min(...ys) - pad
    const maxY = Math.max(...ys) + pad

    const fullWidth = maxX - minX
    const fullHeight = maxY - minY
    // Record the unzoomed width so the pan handler can convert pixels to units.
    viewportScaleRef.current = fullWidth / Math.max(1, stageWidth)

    const width = fullWidth / zoom
    const height2 = fullHeight / zoom
    const cx = (minX + maxX) / 2 + pan.x
    const cy = (minY + maxY) / 2 + pan.y
    return `${cx - width / 2} ${cy - height2 / 2} ${width} ${height2}`
  }, [bars, floor.outline, axisLabels, zoom, pan, stageWidth])

  if (rows.length === 0) {
    return (
      <div className="fin-empty">
        <span className="fin-empty__title">No custodied balances</span>
        <span className="fin-empty__body">
          Connect an institution in Finocurve Service to populate the landscape.
        </span>
      </div>
    )
  }

  return (
    <div className="fin-landscape">
      <div className="fin-landscape__stage" style={{ height }} ref={stageRef}>
        <svg
          ref={svgRef}
          className="fin-landscape__svg"
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={
            `Three-dimensional field of ${rows.length} institutions by ${matrix.exposures.length} exposure types. ` +
            'Exact figures are in the matrix table below.'
          }
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onWheel={onWheel}
          onKeyDown={onKeyDown}
        >
          {/* Floor plane and its grid */}
          <polygon points={floor.outline} className="fin-landscape__floor" />
          {floor.gridLines.map((line, i) => (
            <line key={i} {...line} className="fin-landscape__gridline" />
          ))}

          {/* Axis labels sit on the floor plane, so they rotate with the field */}
          {axisLabels.institutions.map((label) => (
            <text
              key={label.key}
              x={label.x}
              y={label.y}
              className="fin-landscape__axis-label"
              textAnchor={label.anchor}
              dominantBaseline="middle"
              transform={`rotate(${label.rotate} ${label.x} ${label.y})`}
            >
              {label.text.length > 18 ? `${label.text.slice(0, 17)}…` : label.text}
            </text>
          ))}
          {axisLabels.exposures.map((label) => (
            <text
              key={label.key}
              x={label.x}
              y={label.y}
              className="fin-landscape__axis-label fin-landscape__axis-label--exposure"
              textAnchor={label.anchor}
              dominantBaseline="middle"
              transform={`rotate(${label.rotate} ${label.x} ${label.y})`}
            >
              {label.text}
            </text>
          ))}

          {/* Bars, far to near */}
          {bars.map((bar) => {
            const isHovered = hovered?.row === bar.cell.row && hovered?.col === bar.cell.col
            const dimmed = hovered != null && !isHovered
            return (
              <g
                key={`${bar.cell.row}-${bar.cell.col}`}
                className="fin-landscape__bar"
                opacity={dimmed ? 0.45 : 1}
                onPointerEnter={() => setHovered(bar.cell)}
                onPointerLeave={() => setHovered(null)}
              >
                {bar.faces.map((face, i) => (
                  <polygon
                    key={i}
                    points={face.points}
                    fill={face.fill}
                    fillOpacity={face.opacity}
                    className="fin-landscape__face"
                  />
                ))}
                {isHovered && (
                  <text
                    x={bar.topX}
                    y={bar.topY - 12}
                    textAnchor="middle"
                    className="fin-landscape__value"
                  >
                    {formatCompactCurrency(bar.cell.value)}
                  </text>
                )}
              </g>
            )
          })}
        </svg>

        {hovered && (
          <div className="fin-landscape__readout" role="status">
            <span className="fin-landscape__readout-institution">{hovered.institution}</span>
            <span className="fin-landscape__readout-exposure">
              <span
                className="fin-landscape__readout-swatch"
                style={{ background: EXPOSURE_COLORS[hovered.exposure] }}
                aria-hidden
              />
              {EXPOSURE_LABELS[hovered.exposure]}
            </span>
            <span className="fin-landscape__readout-value fin-num">{formatCurrency(hovered.value)}</span>
            <span className="fin-landscape__readout-weight fin-num">
              {formatWeight(matrix.total > 0 ? (hovered.value / matrix.total) * 100 : 0)} of AUA
            </span>
          </div>
        )}

        <div className="fin-landscape__controls" role="group" aria-label="Landscape view controls">
          <button
            type="button"
            className="fin-btn fin-btn--icon"
            onClick={() => setZoom((z) => clampZoom(z * 1.2))}
            disabled={zoom >= MAX_ZOOM}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <Plus size={14} aria-hidden />
          </button>
          <span className="fin-landscape__zoom fin-num" aria-live="polite">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            className="fin-btn fin-btn--icon"
            onClick={() => setZoom((z) => clampZoom(z / 1.2))}
            disabled={zoom <= MIN_ZOOM}
            title="Zoom out"
            aria-label="Zoom out"
          >
            <Minus size={14} aria-hidden />
          </button>
          <button
            type="button"
            className="fin-btn fin-btn--icon"
            onClick={() => setZoom(1)}
            disabled={zoom === 1}
            title="Fit to panel"
            aria-label="Fit to panel"
          >
            <Maximize2 size={13} aria-hidden />
          </button>
          <button
            type="button"
            className="fin-btn fin-landscape__reset"
            onClick={resetView}
            title="Reset rotation, zoom and pan"
          >
            <RotateCcw size={13} aria-hidden /> Reset
          </button>
        </div>
      </div>

      <div className="fin-landscape__foot">
        <div className="fin-legend">
          {matrix.exposures.map((exposure) => (
            <span className="fin-legend__item" key={exposure}>
              <span
                className="fin-legend__swatch fin-legend__swatch--dot"
                style={{ background: EXPOSURE_COLORS[exposure] }}
              />
              {EXPOSURE_LABELS[exposure]}
            </span>
          ))}
        </div>
        <p className="fin-footnote">
          Parallel projection — a bar twice as tall is twice the balance wherever it sits in the
          field. Drag or ← → to rotate, ⌘/Ctrl-scroll or +/− to zoom, shift-drag to pan. Exact
          figures are in the matrix below.
        </p>
      </div>
    </div>
  )
}
