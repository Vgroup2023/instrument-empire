/** A small spinning circle. Pair it with words (or give it a label) so it also reads well to a screen reader. */
export function Spinner({ size = 20, className = '', label }: { size?: number; className?: string; label?: string }) {
  return (
    <span role={label ? 'status' : undefined} aria-label={label} className={`inline-flex ${className}`}>
      <span
        aria-hidden
        className="animate-spin rounded-full border-2 border-brand-200 border-t-brand-600 motion-reduce:animate-none motion-reduce:border-t-brand-200"
        style={{ width: size, height: size }}
      />
    </span>
  );
}
