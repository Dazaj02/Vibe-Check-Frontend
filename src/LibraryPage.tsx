import { useEffect, useState } from 'react'
import { FaArrowLeft, FaTrash, FaMusic, FaPlay } from 'react-icons/fa'

type Song = {
  title: string
  artist: string
  duration: string
  pitch: number
  audio_url: string
}

const API_BASE = import.meta.env.VITE_API_URL || '/api'

export function LibraryPage({
  onNavigateBack,
  onSongSelect,
}: {
  onNavigateBack: () => void
  onSongSelect: (song: Song) => void
}) {
  const [librarySongs, setLibrarySongs] = useState<Song[]>([])
  const [playlists, setPlaylists] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [selectedSongs, setSelectedSongs] = useState<Set<string>>(new Set())
  const [selectedPlaylist, setSelectedPlaylist] = useState<string>('')

  useEffect(() => {
    loadLibrary()
    loadPlaylists()
  }, [])

  const loadLibrary = async () => {
    try {
      const response = await fetch(`${API_BASE}/library`)
      if (!response.ok) {
        setMessage('Failed to load library')
        return
      }
      const data = await response.json()
      setLibrarySongs(data.songs || [])
    } catch (error) {
      console.error('Error loading library:', error)
      setMessage('Error loading library')
    }
  }

  const loadPlaylists = async () => {
    try {
      const response = await fetch(`${API_BASE}/playlists`)
      if (!response.ok) {
        setMessage('Failed to load playlists')
        return
      }
      const data = await response.json()
      setPlaylists(data.playlists || [])
    } catch (error) {
      console.error('Error loading playlists:', error)
      setMessage('Error loading playlists')
    }
  }

  const toggleSongSelection = (audioUrl: string) => {
    const newSelected = new Set(selectedSongs)
    if (newSelected.has(audioUrl)) {
      newSelected.delete(audioUrl)
    } else {
      newSelected.add(audioUrl)
    }
    setSelectedSongs(newSelected)
  }

  const deleteSong = async (audioUrl: string) => {
    try {
      const response = await fetch(`${API_BASE}/library/${encodeURIComponent(audioUrl)}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        setMessage('Failed to delete song')
        return
      }

      setMessage('Song deleted from library')
      await loadLibrary()
      setSelectedSongs(prev => {
        const newSet = new Set(prev)
        newSet.delete(audioUrl)
        return newSet
      })
    } catch (error) {
      console.error('Error deleting song:', error)
      setMessage('Error deleting song')
    }
  }

  const addSelectedToPlaylist = async () => {
    if (selectedSongs.size === 0) {
      setMessage('No songs selected')
      return
    }

    if (!selectedPlaylist) {
      setMessage('No playlist selected')
      return
    }

    let successCount = 0
    for (const audioUrl of selectedSongs) {
      try {
        const response = await fetch(`${API_BASE}/library/add-to-playlist`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            playlistName: selectedPlaylist,
            audioUrl,
          }),
        })

        if (response.ok) {
          successCount++
        }
      } catch (error) {
        console.error('Error adding song to playlist:', error)
      }
    }

    setMessage(`Added ${successCount} song(s) to '${selectedPlaylist}'`)
    setSelectedSongs(new Set())
    setSelectedPlaylist('')
  }

  const deleteSelectedSongs = async () => {
    if (selectedSongs.size === 0) {
      setMessage('No songs selected')
      return
    }

    if (!confirm(`Delete ${selectedSongs.size} selected song(s)?`)) {
      return
    }

    let deletedCount = 0
    for (const audioUrl of selectedSongs) {
      try {
        const response = await fetch(`${API_BASE}/library/${encodeURIComponent(audioUrl)}`, {
          method: 'DELETE',
        })

        if (response.ok) {
          deletedCount++
        }
      } catch (error) {
        console.error('Error deleting song:', error)
      }
    }

    setMessage(`Deleted ${deletedCount} song(s) from library`)
    setSelectedSongs(new Set())
    await loadLibrary()
  }

  return (
    <div className="page">
      <canvas className="visualizer-bg" />

      <main className="shell" style={{ maxWidth: '1400px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button
              onClick={onNavigateBack}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text)',
                cursor: 'pointer',
                fontSize: '1.5rem',
              }}
            >
              <FaArrowLeft />
            </button>
            <h1>My Music Library</h1>
          </div>
          <div style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
            {selectedSongs.size} of {librarySongs.length} selected
          </div>
        </header>

        {message && (
          <div style={{
            background: 'rgba(102, 126, 234, 0.1)',
            color: 'var(--text)',
            padding: '0.8rem 1rem',
            borderRadius: '4px',
            marginBottom: '1rem',
            borderLeft: '3px solid #667eea',
          }}>
            {message}
          </div>
        )}

        {librarySongs.length === 0 ? (
          <section style={{ background: 'rgba(30, 30, 50, 0.8)', borderRadius: '12px', padding: '2rem', textAlign: 'center' }}>
            <FaMusic size={48} style={{ color: 'var(--muted)', marginBottom: '1rem' }} />
            <p style={{ color: 'var(--muted)' }}>Your library is empty. Start by uploading some music files!</p>
          </section>
        ) : (
          <>
            {selectedSongs.size > 0 && (
              <div
                style={{
                  display: 'flex',
                  gap: '1rem',
                  marginBottom: '1.5rem',
                  padding: '1rem',
                  background: 'rgba(102, 126, 234, 0.1)',
                  borderRadius: '8px',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <div style={{ flex: 1, minWidth: '150px' }}>
                  <strong>{selectedSongs.size} song(s) selected</strong>
                </div>
                
                <select
                  value={selectedPlaylist}
                  onChange={(e) => setSelectedPlaylist(e.target.value)}
                  style={{
                    background: 'rgba(102, 126, 234, 0.2)',
                    border: '1px solid #667eea',
                    color: 'var(--text)',
                    padding: '0.6rem 0.8rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  <option value="">Select playlist...</option>
                  {playlists.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>

                <button
                  onClick={addSelectedToPlaylist}
                  disabled={!selectedPlaylist}
                  style={{
                    background: selectedPlaylist ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'rgba(102, 126, 234, 0.3)',
                    border: 'none',
                    color: 'white',
                    padding: '0.6rem 1rem',
                    borderRadius: '4px',
                    cursor: selectedPlaylist ? 'pointer' : 'not-allowed',
                    opacity: selectedPlaylist ? 1 : 0.6,
                  }}
                >
                  Add to Playlist
                </button>
                
                <button
                  onClick={deleteSelectedSongs}
                  style={{
                    background: 'rgba(255, 0, 0, 0.2)',
                    border: '1px solid #ff6b6b',
                    color: '#ff6b6b',
                    padding: '0.6rem 1rem',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                  }}
                >
                  <FaTrash /> Delete
                </button>
              </div>
            )}

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: '1rem',
              }}
            >
              {librarySongs.map((song) => (
                <div
                  key={song.audio_url}
                  onClick={() => toggleSongSelection(song.audio_url)}
                  style={{
                    background: selectedSongs.has(song.audio_url)
                      ? 'rgba(102, 126, 234, 0.3)'
                      : 'rgba(30, 30, 50, 0.8)',
                    border: selectedSongs.has(song.audio_url)
                      ? '2px solid #667eea'
                      : '1px solid rgba(102, 126, 234, 0.3)',
                    borderRadius: '8px',
                    padding: '1rem',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.8rem',
                    position: 'relative',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#667eea'
                    e.currentTarget.style.background = 'rgba(102, 126, 234, 0.15)'
                  }}
                  onMouseLeave={(e) => {
                    if (!selectedSongs.has(song.audio_url)) {
                      e.currentTarget.style.background = 'rgba(30, 30, 50, 0.8)'
                      e.currentTarget.style.borderColor = 'rgba(102, 126, 234, 0.3)'
                    }
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        fontWeight: 'bold',
                        color: 'var(--text)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {song.title}
                      </div>
                      <div style={{
                        fontSize: '0.85rem',
                        color: 'var(--muted)',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>
                        {song.artist}
                      </div>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        onSongSelect(song)
                      }}
                      style={{
                        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                        border: 'none',
                        color: 'white',
                        padding: '0.5rem',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      title="Play song"
                    >
                      <FaPlay size={14} />
                    </button>
                  </div>

                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.8rem',
                    color: 'var(--muted)',
                  }}>
                    <span>Pitch: {song.pitch}</span>
                    <span>{song.duration}</span>
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteSong(song.audio_url)
                    }}
                    style={{
                      background: 'rgba(255, 0, 0, 0.2)',
                      border: '1px solid #ff6b6b',
                      color: '#ff6b6b',
                      padding: '0.4rem 0.8rem',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '0.85rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '0.4rem',
                    }}
                  >
                    <FaTrash size={12} /> Delete
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
