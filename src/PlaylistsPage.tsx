import { useEffect, useState } from 'react'
import { FaPlus, FaTrash, FaArrowLeft, FaMusic, FaClock, FaDownload, FaYoutube } from 'react-icons/fa'

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

// Validar URL de YouTube Music o YouTube playlist (con ?list=)
const isValidPlaylistUrl = (url: string): { valid: boolean; message?: string } => {
  if (!url.trim()) return { valid: false, message: 'URL is empty' }
  
  try {
    const urlObj = new URL(url)
    // Aceptar: youtube.com, youtu.be, music.youtube.com
    const isYouTube = urlObj.hostname.includes('youtube.com') || 
                      urlObj.hostname.includes('youtu.be') || 
                      urlObj.hostname.includes('music.youtube.com')
    const hasListParam = urlObj.searchParams.has('list')
    
    if (!isYouTube) return { valid: false, message: 'Must be a YouTube or YouTube Music URL' }
    if (!hasListParam) return { valid: false, message: 'Missing ?list= parameter (not a playlist URL)' }
    
    const listId = urlObj.searchParams.get('list')
    if (!listId || listId.length < 5) return { valid: false, message: 'Invalid playlist ID' }
    
    return { valid: true }
  } catch {
    return { valid: false, message: 'Invalid URL format' }
  }
}

// Validar URL de YouTube Music o YouTube video individual (con ?v=)
const isValidVideoUrl = (url: string): { valid: boolean; message?: string } => {
  if (!url.trim()) return { valid: false, message: 'URL is empty' }
  
  try {
    const urlObj = new URL(url)
    // Aceptar: youtube.com, youtu.be, music.youtube.com
    const isYouTube = urlObj.hostname.includes('youtube.com') || 
                      urlObj.hostname.includes('youtu.be') || 
                      urlObj.hostname.includes('music.youtube.com')
    const hasVideoParam = urlObj.searchParams.has('v') || urlObj.pathname.includes('/watch')
    
    if (!isYouTube) return { valid: false, message: 'Must be a YouTube or YouTube Music URL' }
    if (!hasVideoParam && urlObj.pathname.length < 5) return { valid: false, message: 'Missing video ID' }
    
    return { valid: true }
  } catch {
    return { valid: false, message: 'Invalid URL format' }
  }
}

export function PlaylistsPage({ 
  onNavigateBack, 
  onPlaylistSelect: _onPlaylistSelect
}: { 
  onNavigateBack: () => void
  onPlaylistSelect: (playlistName: string) => void
}) {
  const [playlists, setPlaylists] = useState<string[]>([])
  const [selectedPlaylist, setSelectedPlaylist] = useState<PlaylistInfo | null>(null)
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [message, setMessage] = useState('')
  const [youtubePlaylistUrl, setYoutubePlaylistUrl] = useState('')
  const [youtubeVideoUrl, setYoutubeVideoUrl] = useState('')
  const [isImportingPlaylist, setIsImportingPlaylist] = useState(false)
  const [isImportingVideo, setIsImportingVideo] = useState(false)

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

  const importYoutubePlaylist = async () => {
    if (!youtubePlaylistUrl.trim() || !selectedPlaylist) {
      setMessage('Please enter a YouTube Playlist URL and select a playlist')
      return
    }

    const validation = isValidPlaylistUrl(youtubePlaylistUrl)
    if (!validation.valid) {
      setMessage(`Invalid URL: ${validation.message}`)
      return
    }

    setIsImportingPlaylist(true)
    try {
      const response = await fetch(`${API_BASE}/playlists/${encodeURIComponent(selectedPlaylist.name)}/add-youtube`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtube_url: youtubePlaylistUrl })
      })

      if (!response.ok) {
        const error = await response.json()
        const errorMsg = error.detail || 'Failed to import YouTube playlist'
        console.error('YouTube import error:', errorMsg)
        setMessage(`Error: ${errorMsg}`)
        setIsImportingPlaylist(false)
        return
      }

      const data = await response.json()
      setMessage(`Successfully imported ${data.songs_added} songs!`)
      setYoutubePlaylistUrl('')
      await loadPlaylist(selectedPlaylist.name)
    } catch (error) {
      console.error('Fetch error:', error)
      setMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsImportingPlaylist(false)
    }
  }

  const importYoutubeVideo = async () => {
    if (!youtubeVideoUrl.trim() || !selectedPlaylist) {
      setMessage('Please enter a YouTube Video URL and select a playlist')
      return
    }

    const validation = isValidVideoUrl(youtubeVideoUrl)
    if (!validation.valid) {
      setMessage(`Invalid URL: ${validation.message}`)
      return
    }

    setIsImportingVideo(true)
    try {
      // Extract video ID from URL
      const urlObj = new URL(youtubeVideoUrl)
      let videoId = urlObj.searchParams.get('v')
      
      if (!videoId && urlObj.hostname === 'youtu.be') {
        videoId = urlObj.pathname.substring(1)
      }

      if (!videoId) {
        setMessage('Could not extract video ID from URL')
        setIsImportingVideo(false)
        return
      }

      // Get video info using yt-dlp via backend
      const response = await fetch(`${API_BASE}/playlists/${encodeURIComponent(selectedPlaylist.name)}/add-youtube-song`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ youtube_url: youtubeVideoUrl })
      })

      if (!response.ok) {
        const error = await response.json()
        const errorMsg = error.detail || 'Failed to add song'
        console.error('YouTube add song error:', errorMsg)
        setMessage(`Error: ${errorMsg}`)
        setIsImportingVideo(false)
        return
      }

      const data = await response.json()
      setMessage(`Song added: ${data.song_title || 'Added successfully'}`)
      setYoutubeVideoUrl('')
      await loadPlaylist(selectedPlaylist.name)
    } catch (error) {
      console.error('Fetch error:', error)
      setMessage(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setIsImportingVideo(false)
    }
  }

  return (
    <div className="page">
      <canvas className="visualizer-bg" />
      
      <main className="shell" style={{ maxWidth: '1400px' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <button onClick={onNavigateBack} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', fontSize: '1.5rem' }}>
              <FaArrowLeft />
            </button>
            <h1>My Playlists</h1>
          </div>
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem', height: 'calc(100vh - 150px)' }}>
          {/* Left Panel: Create and Manage Playlists */}
          <section style={{ background: 'rgba(30, 30, 50, 0.8)', borderRadius: '12px', padding: '1.5rem', overflowY: 'auto' }}>
            <h2 style={{ marginTop: 0 }}>Create Playlist</h2>
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '2rem' }}>
              <input
                type="text"
                placeholder="Playlist name..."
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && createPlaylist()}
                style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.5)', color: 'white' }}
              />
              <button
                onClick={createPlaylist}
                style={{
                  background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  border: 'none',
                  color: 'white',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem'
                }}
              >
                <FaPlus /> New
              </button>
            </div>

            <h3>Playlists ({playlists.length})</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {playlists.map((name) => (
                <div
                  key={name}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: selectedPlaylist?.name === name ? 'rgba(102, 126, 234, 0.3)' : 'rgba(0,0,0,0.3)',
                    padding: '0.8rem',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    border: selectedPlaylist?.name === name ? '2px solid #667eea' : '1px solid rgba(255,255,255,0.1)'
                  }}
                  onClick={() => loadPlaylist(name)}
                >
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: '0.3rem 0', fontWeight: 'bold' }}>{name}</p>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deletePlaylist(name)
                    }}
                    style={{
                      background: 'rgba(255, 0, 0, 0.2)',
                      border: 'none',
                      color: '#ff6b6b',
                      cursor: 'pointer',
                      padding: '0.4rem 0.8rem',
                      borderRadius: '4px',
                      fontSize: '0.9rem'
                    }}
                  >
                    <FaTrash />
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* Right Panel: Manage Selected Playlist */}
          <section style={{ background: 'rgba(30, 30, 50, 0.8)', borderRadius: '12px', padding: '1.5rem', overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {!selectedPlaylist ? (
              <p style={{ color: 'var(--muted)', marginTop: '2rem' }}>Select a playlist to view and add songs</p>
            ) : (
              <>
                <h2 style={{ marginTop: 0 }}>{selectedPlaylist.name}</h2>

                {/* Add YouTube Playlist */}
                <div style={{ marginBottom: '1.5rem', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    <FaYoutube style={{ color: '#FF0000' }} /> Add YouTube Playlist
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="https://music.youtube.com/playlist?list=... or https://www.youtube.com/playlist?list=..."
                      value={youtubePlaylistUrl}
                      onChange={(e) => setYoutubePlaylistUrl(e.target.value)}
                      disabled={isImportingPlaylist}
                      style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.5)', color: 'white' }}
                    />
                    <button
                      onClick={importYoutubePlaylist}
                      disabled={isImportingPlaylist}
                      style={{
                        background: isImportingPlaylist ? 'rgba(255, 0, 0, 0.5)' : 'linear-gradient(135deg, #FF0000, #FF6B6B)',
                        border: 'none',
                        color: 'white',
                        padding: '0.5rem 1rem',
                        borderRadius: '4px',
                        cursor: isImportingPlaylist ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {isImportingPlaylist ? 'Loading...' : <FaDownload />}
                    </button>
                  </div>
                </div>

                {/* Add Individual YouTube Song */}
                <div style={{ marginBottom: '1.5rem', background: 'rgba(0,0,0,0.3)', padding: '1rem', borderRadius: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                    <FaYoutube style={{ color: '#FF0000' }} /> Add YouTube Song
                  </label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="https://www.youtube.com/watch?v=..."
                      value={youtubeVideoUrl}
                      onChange={(e) => setYoutubeVideoUrl(e.target.value)}
                      disabled={isImportingVideo}
                      style={{ flex: 1, padding: '0.5rem', borderRadius: '4px', border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(0,0,0,0.5)', color: 'white' }}
                    />
                    <button
                      onClick={importYoutubeVideo}
                      disabled={isImportingVideo}
                      style={{
                        background: isImportingVideo ? 'rgba(255, 0, 0, 0.5)' : 'linear-gradient(135deg, #FF0000, #FF6B6B)',
                        border: 'none',
                        color: 'white',
                        padding: '0.5rem 1rem',
                        borderRadius: '4px',
                        cursor: isImportingVideo ? 'not-allowed' : 'pointer'
                      }}
                    >
                      {isImportingVideo ? 'Adding...' : <FaDownload />}
                    </button>
                  </div>
                </div>

                {/* Songs List */}
                <div style={{ flex: 1 }}>
                  <h3>{selectedPlaylist.songs.length} Songs</h3>
                  {selectedPlaylist.songs.length === 0 ? (
                    <p style={{ color: 'var(--muted)' }}>No songs in this playlist. Add songs using YouTube Playlist or Song import above.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem', maxHeight: 'calc(100% - 3rem)', overflowY: 'auto' }}>
                      {selectedPlaylist.songs.map((song, index) => (
                        <div
                          key={`${song.title}-${index}`}
                          style={{
                            background: 'rgba(0,0,0,0.3)',
                            padding: '0.8rem',
                            borderRadius: '6px',
                            borderLeft: '3px solid #667eea'
                          }}
                        >
                          <p style={{ margin: '0.3rem 0', fontWeight: 'bold', fontSize: '0.95rem' }}>
                            {index + 1}. {song.title}
                          </p>
                          <p style={{ margin: '0.2rem 0', color: 'var(--muted)', fontSize: '0.85rem' }}>
                            <FaMusic size={12} style={{ marginRight: '0.3rem' }} />
                            {song.artist}
                          </p>
                          <p style={{ margin: '0.2rem 0', color: 'var(--muted)', fontSize: '0.85rem' }}>
                            <FaClock size={12} style={{ marginRight: '0.3rem' }} />
                            {song.duration}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>

        <footer className="status" style={{ marginTop: '1rem' }}>{message}</footer>
      </main>
    </div>
  )
}
