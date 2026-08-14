export function Spinner() {
  return (
    <div className="flex justify-center py-8" role="status" aria-label="読み込み中">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
    </div>
  )
}
