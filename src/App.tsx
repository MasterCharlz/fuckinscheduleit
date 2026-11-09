import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'

const weekdays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

type Participant = {
  id: string
  name: string
  days: boolean[]
}

type ParticipantResponse = {
  participant: Participant
}

type BoardResponse = {
  participants: Participant[]
}

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`)
  }

  return response.json() as Promise<T>
}

function App() {
  const [participants, setParticipants] = useState<Participant[]>([])
  const [name, setName] = useState('')
  const [busyParticipant, setBusyParticipant] = useState<string | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    let requestInFlight = false

    const syncBoard = async () => {
      if (requestInFlight) return
      requestInFlight = true

      try {
        const response = await fetch('/api/participants')
        const data = await readResponse<BoardResponse>(response)
        if (!active) return
        setParticipants(data.participants)
        setError('')
      } catch {
        if (active) setError('The shared schedule could not be reached. We will retry automatically.')
      } finally {
        requestInFlight = false
      }
    }

    void syncBoard()
    const intervalId = window.setInterval(() => void syncBoard(), 5000)
    return () => {
      active = false
      window.clearInterval(intervalId)
    }
  }, [])

  const addParticipant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) return

    const existing = participants.find(
      (participant) => participant.name.toLowerCase() === trimmedName.toLowerCase(),
    )
    if (existing) {
      setStatus(`${existing.name} is already on the grid.`)
      setName('')
      return
    }

    setError('')
    setStatus('')
    try {
      const response = await fetch('/api/participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      })
      const data = await readResponse<ParticipantResponse>(response)
      setParticipants((current) =>
        current.some((person) => person.id === data.participant.id)
          ? current
          : [...current, data.participant],
      )
      setName('')
    } catch {
      setError('Could not add that name. Check your connection and try again.')
    }
  }

  const toggleDay = async (participant: Participant, dayIndex: number) => {
    setBusyParticipant(participant.id)
    setError('')

    try {
      const response = await fetch(`/api/participants/${participant.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dayIndex, available: !participant.days[dayIndex] }),
      })
      const data = await readResponse<ParticipantResponse>(response)
      setParticipants((current) =>
        current.map((item) => (item.id === data.participant.id ? data.participant : item)),
      )
    } catch {
      setError('That change was not saved. Refresh the schedule and try again.')
    } finally {
      setBusyParticipant(null)
    }
  }

  const removeParticipant = async (participant: Participant) => {
    if (!window.confirm(`Remove ${participant.name} and their availability?`)) return

    setBusyParticipant(participant.id)
    setError('')
    try {
      const response = await fetch(`/api/participants/${participant.id}`, { method: 'DELETE' })
      await readResponse<{ ok: boolean }>(response)
      setParticipants((current) => current.filter((person) => person.id !== participant.id))
    } catch {
      setError(`Could not remove ${participant.name}. Try again.`)
    } finally {
      setBusyParticipant(null)
    }
  }

  const resetSchedule = async () => {
    if (!window.confirm('Turn every day off for everyone? Names will stay on the grid.')) return

    setError('')
    try {
      const response = await fetch('/api/reset', { method: 'POST' })
      const data = await readResponse<BoardResponse>(response)
      setParticipants(data.participants)
    } catch {
      setError('Could not reset the schedule. Try again.')
    }
  }

  const overlappingDays = weekdays.filter(
    (_, dayIndex) => participants.length > 0 && participants.every((person) => person.days[dayIndex]),
  )

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1>FuckinScheduleIt</h1>
      </header>

      <section className="controls" aria-label="Schedule controls">
        <form className="join-form" onSubmit={addParticipant}>
          <div className="join-input-row">
            <input
              id="participant-name"
              aria-label="Name"
              autoComplete="name"
              maxLength={40}
              placeholder="Name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <button type="submit" className="add-button" disabled={!name.trim()}>
              Add
            </button>
          </div>
        </form>
        <div className="action-buttons">
          <button type="button" className="quiet-button reset-button" onClick={() => void resetSchedule()} disabled={participants.length === 0}>
            Clear
          </button>
        </div>
      </section>

      {(error || status) && <p className={`feedback${error ? ' feedback-error' : ''}`} role={error ? 'alert' : 'status'}>{error || status}</p>}

      <section className="board-section" aria-label="Weekly availability">
        <div className="grid-viewport">
          <div className="availability-grid" role="table" aria-label="Availability by person and day">
            <div className="grid-header" role="row">
              <div className="name-heading" role="columnheader">Name</div>
              {weekdays.map((day, dayIndex) => {
                const isOverlap = overlappingDays.includes(day)
                return (
                  <div className={`day-heading${isOverlap ? ' is-overlap' : ''}`} role="columnheader" key={day}>
                    <span className="day-short">{day.slice(0, 3)}</span>
                    <span className="day-full">{day}</span>
                    <span className="day-result">
                      {participants.length === 0 ? '—' : isOverlap ? 'ALL IN' : `${participants.filter((person) => person.days[dayIndex]).length}/${participants.length}`}
                    </span>
                  </div>
                )
              })}
            </div>

            {participants.map((participant) => (
              <div className="participant-row" role="row" key={participant.id}>
                <div className="participant-name" role="rowheader">
                  <span className="name-text" title={participant.name}>{participant.name}</span>
                  <button
                    type="button"
                    className="remove-button"
                    aria-label={`Remove ${participant.name}`}
                    title={`Remove ${participant.name}`}
                    disabled={busyParticipant === participant.id}
                    onClick={() => void removeParticipant(participant)}
                  >
                    ×
                  </button>
                </div>
                {weekdays.map((day, dayIndex) => (
                  <div className={`day-cell${overlappingDays.includes(day) ? ' is-overlap' : ''}`} role="cell" key={day}>
                    <button
                      type="button"
                      className={`availability-toggle${participant.days[dayIndex] ? ' is-on' : ''}`}
                      aria-pressed={participant.days[dayIndex]}
                      aria-label={`${participant.name}: ${day}, ${participant.days[dayIndex] ? 'available' : 'not available'}`}
                      disabled={busyParticipant === participant.id}
                      onClick={() => void toggleDay(participant, dayIndex)}
                    >
                      {participant.days[dayIndex] ? 'In' : 'Off'}
                    </button>
                  </div>
                ))}
              </div>
            ))}

          </div>
        </div>
      </section>
    </main>
  )
}

export default App
