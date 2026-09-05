import test from 'node:test'
import assert from 'node:assert/strict'
import { greetingFor, preferredName } from '../src/lib/greeting.ts'

test('greeting follows local clock boundaries, including 02:00 and midnight', () => {
  for (const [hour, minute, expected] of [
    [0, 0, 'İyi geceler'], [2, 0, 'İyi geceler'], [4, 59, 'İyi geceler'],
    [5, 0, 'Günaydın'], [11, 59, 'Günaydın'],
    [12, 0, 'İyi günler'], [17, 59, 'İyi günler'],
    [18, 0, 'İyi akşamlar'], [21, 59, 'İyi akşamlar'],
    [22, 0, 'İyi geceler'], [23, 59, 'İyi geceler'],
  ] as const) assert.equal(greetingFor(new Date(2026, 8, 2, hour, minute)).message, expected)
})

test('profile uses Alpargu for empty and legacy Alpar names', () => {
  assert.equal(preferredName(), 'Alpargu')
  assert.equal(preferredName('  '), 'Alpargu')
  assert.equal(preferredName(' Alpar '), 'Alpargu')
  assert.equal(preferredName('Alpargu'), 'Alpargu')
  assert.equal(preferredName('Deniz'), 'Deniz')
})
