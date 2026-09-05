export function greetingFor(date: Date) {
  const hour = date.getHours()
  if (hour >= 5 && hour < 12) return { message: 'Günaydın', copy: 'Yeni bir gün, küçük bir adımla başlar. Bugün kendine ne katmak istersin?' }
  if (hour >= 12 && hour < 18) return { message: 'İyi günler', copy: 'Günün ritmini sen belirle. Bir sonraki küçük adımına odaklan.' }
  if (hour >= 18 && hour < 22) return { message: 'İyi akşamlar', copy: 'Bugünün emeğini görünür kıl. Kaydını tamamla, kendine de zaman ayır.' }
  return { message: 'İyi geceler', copy: 'Günü sakin bir notla kapat. Dinlenmek de ilerlemenin bir parçası.' }
}

export function preferredName(name?: string) {
  const trimmed = name?.trim() ?? ''
  return !trimmed || trimmed.toLocaleLowerCase('tr-TR') === 'alpar' ? 'Alpargu' : trimmed.slice(0, 60)
}
