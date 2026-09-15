/**
 * Decorative ground behind a page masthead.
 *
 * A fine engraved cross-hatch plus one soft wash of the brand hue — the texture
 * of security paper on a printed statement rather than a photograph. It is
 * built from gradients so it costs no network request, inherits the active
 * theme's ink, and stays subordinate to the figures on top of it.
 */
export default function PageGround() {
  return (
    <div className="fin-ground" aria-hidden>
      <div className="fin-ground__wash" />
      <div className="fin-ground__pattern" />
      <div className="fin-ground__fade" />
    </div>
  )
}
