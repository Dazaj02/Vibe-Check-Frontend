import { useEffect, useState } from 'react'
import { FaPlus, FaTrash, FaArrowLeft, FaMusic, FaUser, FaClock, FaCompactDisc } from 'react-icons/fa'

type Song = {
  title: string
  artist: string
  duration: string
  pitch: number
  audio_url: string
}

type PlaylistInfo = {
  name: string
  songs: Song[]
  total: number
}

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export function PlaylistsPage({ onNavigateBack }: { onNavigateBack: () => void }) {
  const [playlists, setPlaylists] = useState<string[]>([])
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistInfo | null>(null)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadPlaylists()
  }, [])

  const loadPlaylists = async () => {
    try {
      const response = await fetch(`${API_BASE}/playlists`)
      const data = await response.json()
      setPlaylists(data.playlists || [])
    } catch (error) {
      setMessage('Failed to load playlists')
    }
  }

  const createPlaylist = async () => {
    if (!newPlaylistName.trim()) {
      setMessage('Playlist name cannot be empty')
      return
    }

    try {
      const response = await fetch(`${API_BASE}/playlists/create?name=${encodeURIComponent(newPlaylistName)}`, {
        method: 'POST'
      })

      if (!response.ok) {
        const error = await response.json()
        setMessage(error.detail || 'Failed to create playlist')
        return
      }

      setMessage(`Playlist '${newPlaylistName}' created!`)
      setNewPlaylistName('')
      await loadPlaylists()
    } catch (error) {
      setMessage('Error creating playlist')
    }
  }

  const loadPlaylist = async (name: string) => {
    try {
      const response = await fetch(`${API_BASE}/playlists/${encodeURIComponent(name)}`)
      if (!response.ok) {
        setMessage('Failed to load playlist')
        return
      }
      const data = await response.json()
      setSelectedPlaylist(data)
    } catch (error) {
      setMessage('Error loading playlist')
    }
  }

  const deletePlaylist = async (name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return

    try {
      const response = await fetch(`${API_BASE}/playlists/${encodeURIComponent(name)}`, {
        method: 'DELETE'
      })

      if (!response.ok) {
        setMessage('Failed to delete playlist')
        return
      }

      setMessage(`Playlist '${name}' deleted`)
      setSelectedPlaylist(null)
      await loadPlaylists()
    } catch (error) {
      setMessage('Error deleting playlist')
    }
  }

  return (
    <div className="page">
      <canvas className="visualizer-bg" />
      
      <main className="shell" style={{ maxWidth: '1400px' }}>
        <header className="hero">
          <h1>My Playlists</h1>
          <p style={{ color: 'var(--muted)' }}>Create and manage your music playlists</p>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '2rem', width: '100%' }}>
          {/* Left Panel - Create/List Playlists */}
          <section className="panel" style={{ height: 'fit-content' }}>
            <h2><FaMusic /> Create New Playlist</h2>
            <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
              <input
                type="text"
                placeholder="Playlist name"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && createPlaylist()}
                style={{ flex: 1 }}
              />
              <button onClick={createPlaylist}><FaPlus /></button>
            </div>

            <div style={{ marginTop: '2rem' }}>
              <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Your Playlists</h3>
              {playlists.length === 0 ? (
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>No playlists yet. Create one!</p>
              ) : (
                <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {playlists.map((name) => (
                    <li
                      key={name}
                      style={{
                        padding: '0.8rem',
                        background: selectedPlaylist?.name === name ? 'rgba(99, 102, 241, 0.2)' : 'rgba(99, 102, 241, 0.1)',
                        border: selectedPlaylist?.name === name ? '1px solid rgba(99, 102, 241, 0.6)' : '1px solid rgba(99, 102, 241, 0.2)',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                      }}
                      onClick={() => loadPlaylist(name)}
                    >
                      <span style={{ fontWeight: '500' }}><FaCompactDisc style={{ marginRight: '0.5rem' }} />{name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          deletePlaylist(name)
                        }}
                        className="danger"
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.8rem' }}
                      >
                        <FaTrash />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <button
              onClick={onNavigateBack}
              style={{ width: '100%', marginTop: '2rem', background: 'rgba(99, 102, 241, 0.2)' }}
            >
              <FaArrowLeft /> Back to Player
            </button>
          </section>

          {/* Right Panel - Playlist Contents */}
          <section className="panel">
            {selectedPlaylist ? (
              <>
                <h2><FaMusic /> {selectedPlaylist.name}</h2>
                <p style={{ color: 'var(--muted)', fontSize: '0.9rem', marginTop: '0.5rem' }}>
                  📊 Total songs: {selectedPlaylist.total}
                </p>

                {selectedPlaylist.songs.length === 0 ? (
                  <p style={{ color: 'var(--muted)', marginTop: '2rem' }}>No songs in this playlist</p>
                ) : (
                  <div
                    style={{
                      marginTop: '1.5rem',
                      maxHeight: '70vh',
                      overflowY: 'auto',
                      paddingRight: '0.5rem'
                    }}
                  >
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.8rem' }}>
                      {selectedPlaylist.songs.map((song, index) => (
                        <li
                          key={`${song.title}-${index}`}
                          style={{
                            padding: '1rem',
                            background: 'rgba(15, 23, 42, 0.75)',
                            border: '1px solid rgba(99, 102, 241, 0.2)',
                            borderRadius: '10px',
                            transition: 'all 0.2s ease'
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.95)'
                            e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.4)'
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'rgba(15, 23, 42, 0.75)'
                            e.currentTarget.style.borderColor = 'rgba(99, 102, 241, 0.2)'
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                            <div style={{ flex: 1 }}>
                              <p style={{ margin: '0 0 0.3rem 0', fontWeight: '600', fontSize: '1rem', color: '#f8fafc' }}>
                                <FaMusic style={{ marginRight: '0.5rem' }} />{index + 1}. {song.title}
                              </p>
                              <p style={{ margin: '0.2rem 0', fontSize: '0.9rem', color: '#cbd5e1' }}>
                                <FaUser style={{ marginRight: '0.5rem' }} />Artist: {song.artist}
                              </p>
                              <p style={{ margin: '0.2rem 0', fontSize: '0.85rem', color: '#cbd5e1' }}>
                                <FaCompactDisc style={{ marginRight: '0.5rem' }} />Album: Unknown
                              </p>
                              <p style={{ margin: '0.2rem 0', fontSize: '0.85rem', color: '#cbd5e1' }}>
                                <FaClock style={{ marginRight: '0.5rem' }} />Duration: {song.duration}
                              </p>
                              <p style={{ margin: '0.5rem 0 0 0', fontSize: '0.8rem', color: 'rgba(99, 102, 241, 0.7)' }}>
                                🎵 Pitch: x{song.pitch.toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--muted)' }}>
                <p>Select a playlist to view its songs</p>
              </div>
            )}
          </section>
        </div>

        <footer className="status">{message}</footer>
      </main>
    </div>
  )
}
