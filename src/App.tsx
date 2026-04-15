import { useEffect, useMemo, useRef, useState } from 'react'
import { PlaylistsPage } from './PlaylistsPage'
import { FaPlay, FaPause, FaStepBackward, FaStepForward, FaList, FaSort, FaDownload, FaTrash, FaPlus } from 'react-icons/fa'

type Song = {
  id: string
  title: string
  artist: string
  duration: string
  pitch: number
  audio_url: string
}

type PlaylistState = {
  songs: Song[]
  current: Song | null
  currentIndex?: number
  playlistName?: string | null
}

const API_BASE = import.meta.env.VITE_API_URL || '/api'
const ENABLE_AUDIO_ANALYZER = true

const toPlayableUrl = (audioUrl: string) => {
  if (audioUrl.startsWith('/stream?url=')) {
    return `${API_BASE}${audioUrl}`
  }
  if (audioUrl.startsWith('/') || audioUrl.startsWith('http://') || audioUrl.startsWith('https://')) {
    return `${API_BASE}/stream?url=${encodeURIComponent(audioUrl)}`
  }
  return audioUrl
}

function App() {
  const [currentPage, setCurrentPage] = useState<'player' | 'playlists'>('player')
  const [playlist, setPlaylist] = useState<Song[]>([])
  const [current, setCurrent] = useState<Song | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [localPitch, setLocalPitch] = useState(1)
  const [volume, setVolume] = useState(1)
  const [isDraggingProgress, setIsDraggingProgress] = useState(false)
  const [message, setMessage] = useState('Ready')
  const [navDebug, setNavDebug] = useState('')
  const [localFiles, setLocalFiles] = useState<File[]>([])
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const [selectedPlaylist, setSelectedPlaylist] = useState<string | null>(null)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const rafRef = useRef<number | null>(null)
  const waveformDataRef = useRef<Uint8Array | null>(null)
  const progressRef = useRef<HTMLDivElement | null>(null)
  const volumeRef = useRef<number>(1)
  const autoPlayPendingRef = useRef(false)
  const skipCurrentSyncRef = useRef(false)
  const isPlayingRef = useRef(false)
  const isChangingSongRef = useRef(false)
  const playlistRef = useRef<Song[]>([])
  const currentIndexRef = useRef(-1)
  const activeIndexRef = useRef(-1)
  const currentPositionRef = useRef(-1)
  const selectedPlaylistRef = useRef<string | null>(null)
  const listLoadRequestRef = useRef(0)
  const playRequestIdRef = useRef(0)

  const applyServerState = (data: PlaylistState & { message?: string }) => {
    const nextSongs = Array.isArray(data.songs) ? data.songs : []
    setPlaylist(nextSongs)
    playlistRef.current = nextSongs
    setCurrent(data.current || null)

    if (typeof data.currentIndex === 'number') {
      currentPositionRef.current = data.currentIndex
      activeIndexRef.current = data.currentIndex
      currentIndexRef.current = data.currentIndex
    } else {
      const fallbackIndex = resolveCurrentIndex(nextSongs, data.current || null)
      currentPositionRef.current = fallbackIndex
      activeIndexRef.current = fallbackIndex
      currentIndexRef.current = fallbackIndex
    }
  }

  const resolveCurrentIndex = (songs: Song[], currentSong: Song | null): number => {
    if (!currentSong) return -1

    const exactRefIndex = songs.findIndex((song) => song === currentSong)
    if (exactRefIndex >= 0) return exactRefIndex

    const strictMatchIndex = songs.findIndex(
      (song) =>
        song.audio_url === currentSong.audio_url &&
        song.title === currentSong.title &&
        song.artist === currentSong.artist,
    )
    if (strictMatchIndex >= 0) return strictMatchIndex

    return songs.findIndex((song) => song.audio_url === currentSong.audio_url)
  }

  const currentIndex = useMemo(
    () => resolveCurrentIndex(playlist, current),
    [playlist, current],
  )

  // Get upcoming songs for the queue (compact list)
  const queueSongs = useMemo(() => {
    if (playlist.length === 0) return []

    const compactCount = 6

    if (currentIndex < 0 || currentIndex >= playlist.length) {
      return playlist.slice(0, compactCount)
    }

    const upcoming = playlist.slice(currentIndex + 1)
    return upcoming.slice(0, compactCount)
  }, [playlist, currentIndex])

  const activeListName = selectedPlaylist || '__songs__'

  const refreshState = async () => {
    try {
      const response = await fetch(`${API_BASE}/playlist`)
      if (!response.ok) throw new Error('Failed to fetch playlist')
      const data = (await response.json()) as PlaylistState
      if (!Array.isArray(data.songs)) throw new Error('Invalid response format')
      applyServerState(data)
    } catch (error) {
      console.error('Error refreshing state:', error)
      setMessage('Failed to refresh playlist')
    }
  }

  const loadSelectedPlaylist = async (playlistName: string, songsOverride?: Song[]) => {
    try {
      void songsOverride
      listLoadRequestRef.current += 1
      autoPlayPendingRef.current = false
      skipCurrentSyncRef.current = false
      isChangingSongRef.current = false
      currentPositionRef.current = -1
      activeIndexRef.current = -1
      currentIndexRef.current = -1
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.removeAttribute('src')
        audioRef.current.load()
      }

      const response = await fetch(`${API_BASE}/playlist/select`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: playlistName, index: 0 }),
      })

      if (!response.ok) {
        setMessage('Failed to load playlist')
        return
      }

      const data = await response.json() as PlaylistState & { message?: string }
      applyServerState(data)

      setSelectedPlaylist(playlistName)
      setCurrentTime(0)
      stopVisualizerAnimation()
      setMessage(`Loaded playlist: ${playlistName}`)

      // Cambiar al player automáticamente
      setCurrentPage('player')

      if (data.current) {
        await playSongNow(data.current, data.currentIndex, data.songs)
      } else {
        setCurrent(null)
      }
    } catch (error) {
      console.error('Error loading playlist:', error)
      setMessage('Error loading playlist')
    }
  }

  const closePlaylist = async () => {
    try {
      listLoadRequestRef.current += 1
      autoPlayPendingRef.current = false
      skipCurrentSyncRef.current = false
      isChangingSongRef.current = false
      currentPositionRef.current = -1
      activeIndexRef.current = -1
      currentIndexRef.current = -1
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current.removeAttribute('src')
        audioRef.current.load()
      }

      const response = await fetch(`${API_BASE}/playlist/select-songs`, { method: 'POST' })
      if (!response.ok) {
        setMessage('Could not return to songs')
        return
      }

      const data = await response.json() as PlaylistState & { message?: string }
      applyServerState(data)
      setSelectedPlaylist(null)
      setMessage('Showing Songs')
      setCurrentPage('playlists')
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      setMessage(`Error: ${errorMsg}`)
    }
  }

  const removeSongFromPlaylist = async (songIndex: number, songTitle: string) => {
    try {
      const response = await fetch(
        `${API_BASE}/playlists/${encodeURIComponent(activeListName)}/songs/index/${songIndex}`,
        { method: 'DELETE' }
      )

      if (!response.ok) {
        const error = await response.json()
        setMessage(`Error: ${error.detail || 'Failed to remove song'}`)
        return
      }

      // Refresh playlist
      const playlistResponse = await fetch(`${API_BASE}/playlists/${encodeURIComponent(activeListName)}`)
      if (playlistResponse.ok) {
        const playlistData = await playlistResponse.json() as { songs: Song[] }
        const nextSongs = Array.isArray(playlistData.songs) ? playlistData.songs : []
        playlistRef.current = nextSongs
        setPlaylist(nextSongs)

        if (current) {
          const stillExists = nextSongs.find((s) => s.audio_url === current.audio_url)
          if (stillExists) {
            setCurrent(stillExists)
          } else if (nextSongs.length > 0) {
            setCurrent(nextSongs[Math.min(songIndex, nextSongs.length - 1)])
          } else {
            setCurrent(null)
            setIsPlaying(false)
          }
        }
      }
      setMessage(`Removed: ${songTitle}`)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      setMessage(`Error: ${errorMsg}`)
    }
  }

  const moveSongInPlaylist = async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) {
      return
    }

    try {
      const response = await fetch(
        `${API_BASE}/playlists/${encodeURIComponent(activeListName)}/move-song`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fromIndex, toIndex }),
        }
      )

      if (!response.ok) {
        const error = await response.json()
        setMessage(`Error: ${error.detail || 'Failed to move song'}`)
        return
      }

      const data = await response.json() as { songs: Song[] }
      const nextSongs = Array.isArray(data.songs) ? data.songs : []
      playlistRef.current = nextSongs
      setPlaylist(nextSongs)

      if (current) {
        const relocatedCurrent = nextSongs.find((s) => s.audio_url === current.audio_url)
        if (relocatedCurrent) {
          setCurrent(relocatedCurrent)
        } else if (nextSongs.length > 0) {
          setCurrent(nextSongs[0])
        } else {
          setCurrent(null)
          setIsPlaying(false)
        }
      }

      setMessage('Song moved')
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      setMessage(`Error: ${errorMsg}`)
    }
  }

  const playSongNow = async (song: Song, playlistIndex?: number, sourceSongs?: Song[]) => {
    const audio = audioRef.current
    if (!audio) return
    const requestId = ++playRequestIdRef.current

    isChangingSongRef.current = true
    autoPlayPendingRef.current = false
    skipCurrentSyncRef.current = false

    try {
      setupAudioAnalyzer()
      if (ctxRef.current?.state === 'suspended') {
        await ctxRef.current.resume()
      }

      audio.pause()
      audio.currentTime = 0

      const nextSrc = new URL(toPlayableUrl(song.audio_url), window.location.href).href
      audio.src = nextSrc
      audio.load()
      audio.playbackRate = song.pitch

      setCurrent(song)
      const songsContext = sourceSongs ?? playlistRef.current
      const resolvedIndex =
        typeof playlistIndex === 'number' ? playlistIndex : resolveCurrentIndex(songsContext, song)
      const audioSrc = new URL(toPlayableUrl(song.audio_url), window.location.href).href
      activeIndexRef.current = resolvedIndex
      currentPositionRef.current = resolvedIndex
      currentIndexRef.current = resolvedIndex
      setNavDebug(`PLAY list=${selectedPlaylistRef.current || '__songs__'} idx=${resolvedIndex} title=${song.title} src=${audioSrc}`)
      setCurrentTime(0)
      setIsPlaying(false)
      setMessage(`Loading: ${song.title}...`)

      await audio.play()

      // Ignore outdated async completions
      if (requestId !== playRequestIdRef.current) {
        return
      }

      setMessage('Playback running')
      if (!rafRef.current) {
        animateBackground()
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      const errName = typeof error === 'object' && error !== null && 'name' in error ? String((error as { name?: unknown }).name) : ''

      if (errName === 'NotAllowedError') {
        setMessage(`Track ready: ${song.title}. Press Play.`)
        return
      }

      setMessage(`Could not play: ${msg}`)
      throw error
    } finally {
      isChangingSongRef.current = false
    }
  }

  const playWithAnalyzerFallback = async (song: Song, playlistIndex?: number, sourceSongs?: Song[]) => {
    await playSongNow(song, playlistIndex, sourceSongs)
  }

  const resolvePlayingIndexFromAudioElement = (songs: Song[]): number => {
    const audio = audioRef.current
    if (!audio) return -1

    const currentSrc = (audio.currentSrc || audio.src || '').trim()
    if (!currentSrc) return -1

    try {
      const srcUrl = new URL(currentSrc)
      const streamedTarget = srcUrl.searchParams.get('url')
      if (streamedTarget) {
        const decodedTarget = decodeURIComponent(streamedTarget)
        const directMatchIndex = songs.findIndex((song) => song.audio_url === decodedTarget)
        if (directMatchIndex >= 0) {
          return directMatchIndex
        }
      }
    } catch {
      // Ignore parse errors and continue fallback matching
    }

    for (let i = 0; i < songs.length; i += 1) {
      try {
        const candidateSrc = new URL(toPlayableUrl(songs[i].audio_url), window.location.href).href
        if (candidateSrc === currentSrc) {
          return i
        }
      } catch {
        // ignore malformed candidate URL
      }
    }

    return -1
  }

  const playFirstAvailableFrom = async (
    startIndex: number,
    direction: 1 | -1 = 1,
    sourceSongs?: Song[],
  ): Promise<boolean> => {
    const songs = sourceSongs ?? playlistRef.current

    if (songs.length === 0) {
      return false
    }

    for (let attempt = 0; attempt < songs.length; attempt += 1) {
      const idx = (startIndex + attempt * direction + songs.length) % songs.length
      const candidate = songs[idx]
      try {
        await playWithAnalyzerFallback(candidate, idx, songs)
        return true
      } catch {
        // Try next candidate
      }
    }

    setMessage('No playable songs in this list')

    if (audioRef.current) {
      try {
        audioRef.current.pause()
        audioRef.current.currentTime = 0
        audioRef.current.removeAttribute('src')
        audioRef.current.load()
      } catch {
        // ignore
      }
    }

    isChangingSongRef.current = false
    autoPlayPendingRef.current = false
    skipCurrentSyncRef.current = false
    return false
  }

  const probeSongDuration = (audioUrl: string): Promise<number> => {
    return new Promise((resolve) => {
      const audio = document.createElement('audio')
      const src = toPlayableUrl(audioUrl)
      let done = false

      const cleanup = () => {
        audio.removeEventListener('loadedmetadata', onLoaded)
        audio.removeEventListener('error', onError)
        audio.src = ''
      }

      const finish = (value: number) => {
        if (done) return
        done = true
        cleanup()
        resolve(value)
      }

      const onLoaded = () => finish(audio.duration)
      const onError = () => finish(0)

      audio.preload = 'metadata'
      audio.addEventListener('loadedmetadata', onLoaded)
      audio.addEventListener('error', onError)
      audio.src = src

      setTimeout(() => finish(0), 8000)
    })
  }

  const playNext = async () => {
    try {
      const response = await fetch(`${API_BASE}/player/next`, { method: 'POST' })
      if (!response.ok) {
        const error = await response.json() as { detail?: string }
        setMessage(error.detail || 'Could not play next track')
        return
      }

      const data = await response.json() as PlaylistState & { message?: string }
      applyServerState(data)
      if (data.current) {
        await playSongNow(data.current, data.currentIndex, data.songs)
      }
      setNavDebug(`NEXT backend idx=${data.currentIndex ?? -1} title=${data.current?.title ?? 'none'}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not play next track')
    }
  }

  const playPrevious = async () => {
    try {
      const response = await fetch(`${API_BASE}/player/previous`, { method: 'POST' })
      if (!response.ok) {
        const error = await response.json() as { detail?: string }
        setMessage(error.detail || 'Could not play previous track')
        return
      }

      const data = await response.json() as PlaylistState & { message?: string }
      applyServerState(data)
      if (data.current) {
        await playSongNow(data.current, data.currentIndex, data.songs)
      }
      setNavDebug(`PREV backend idx=${data.currentIndex ?? -1} title=${data.current?.title ?? 'none'}`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not play previous track')
    }
  }

  const postState = async (path: string, body?: unknown, method = 'POST') => {
    try {
      const response = await fetch(`${API_BASE}${path}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })

      if (!response.ok) {
        const error = await response.json() as { detail?: string }
        setMessage(error.detail || 'Request failed')
        return
      }

      const data = (await response.json()) as unknown
      
      // Handle different response types
      if (typeof data === 'object' && data !== null) {
        const objData = data as Record<string, unknown>
        if ('songs' in objData && 'current' in objData) {
          applyServerState(objData as PlaylistState & { message?: string })
        }
        if ('message' in objData) {
          setMessage(String(objData.message))
        }
      }
      
    } catch (error) {
      console.error('Error posting state:', error)
      setMessage('Network error')
    }
  }

  const setupAudioAnalyzer = () => {
    if (!ENABLE_AUDIO_ANALYZER) {
      return
    }

    if (!audioRef.current || ctxRef.current) {
      return
    }

    try {
      const audioContext = new window.AudioContext()
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.8

      const source = audioContext.createMediaElementSource(audioRef.current)
      source.connect(analyser)
      analyser.connect(audioContext.destination)

      ctxRef.current = audioContext
      analyserRef.current = analyser
    } catch {
      analyserRef.current = null
    }
  }

  const stopVisualizerAnimation = () => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    
    // Draw static background
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const visualWidth = document.documentElement.clientWidth
    const visualHeight = document.documentElement.clientHeight
    
    canvas.width = Math.floor(visualWidth * dpr)
    canvas.height = Math.floor(visualHeight * dpr)
    canvas.style.width = `${visualWidth}px`
    canvas.style.height = `${visualHeight}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    
    // Static gradient (idle state)
    const gradient = ctx.createRadialGradient(
      visualWidth * 0.5,
      visualHeight * 0.55,
      20,
      visualWidth * 0.5,
      visualHeight * 0.55,
      Math.max(visualWidth, visualHeight) * 0.8,
    )
    gradient.addColorStop(0, 'rgba(64, 84, 170, 0.28)')
    gradient.addColorStop(0.45, 'rgba(26, 10, 64, 0.45)')
    gradient.addColorStop(1, 'rgba(2, 6, 23, 0.94)')
    
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, visualWidth, visualHeight)
  }

  const animateBackground = () => {
    const canvas = canvasRef.current
    const analyser = analyserRef.current
    if (!canvas) {
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) {
      return
    }

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const visualWidth = document.documentElement.clientWidth
    const visualHeight = document.documentElement.clientHeight
    
    canvas.width = Math.floor(visualWidth * dpr)
    canvas.height = Math.floor(visualHeight * dpr)
    canvas.style.width = `${visualWidth}px`
    canvas.style.height = `${visualHeight}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const bufferLength = analyser ? analyser.frequencyBinCount : 96
    const dataArray = new Uint8Array(bufferLength)

    const draw = () => {
      if (analyser) {
        analyser.getByteFrequencyData(dataArray)
      } else {
        const t = performance.now() / 1000
        const mediaTime = audioRef.current?.currentTime || t
        const beatPhase = mediaTime * (1.7 + volumeRef.current * 1.4) * Math.PI
        const beat = isPlayingRef.current ? (Math.sin(beatPhase) + 1) * 0.5 : 0.08
        const amp = isPlayingRef.current ? 65 + beat * 135 : 18

        for (let i = 0; i < bufferLength; i += 1) {
          const wave =
            Math.sin(t * 2.4 + i * 0.19) +
            Math.sin(t * 1.1 + i * 0.13 + beatPhase * 0.35) +
            Math.cos(t * 0.8 + i * 0.07)

          const v = 42 + wave * amp * (0.4 + volumeRef.current * 0.6)
          dataArray[i] = Math.max(0, Math.min(255, Math.floor(v)))
        }
      }
      waveformDataRef.current = new Uint8Array(dataArray)

      const avg = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength
      const pulse = avg / 255

      // Multicolor gradient background based on audio
      const gradient = ctx.createRadialGradient(
        visualWidth * 0.5,
        visualHeight * 0.55,
        20,
        visualWidth * 0.5,
        visualHeight * 0.55,
        Math.max(visualWidth, visualHeight) * 0.75,
      )
      
      // Dynamic colors based on average frequency and volume
      const hueShift = (pulse * 360) % 360
      const volumeBoost = volumeRef.current
      gradient.addColorStop(0, `hsla(${hueShift}, 100%, 60%, ${(0.2 + pulse * 0.3) * volumeBoost})`)
      gradient.addColorStop(0.5, `hsla(${(hueShift + 120) % 360}, 100%, 50%, ${(0.12 + pulse * 0.2) * volumeBoost})`)
      gradient.addColorStop(1, 'rgba(2, 6, 23, 0.92)')

      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, visualWidth, visualHeight)

      // Use all frequency data for maximum reactivity
      const barCount = bufferLength
      const barWidth = visualWidth / barCount
      
      for (let i = 0; i < barCount; i += 1) {
        const dataIndex = i
        const barPosition = i * barWidth
        
        const value = dataArray[dataIndex]
        const barHeight = (value / 255) * visualHeight * 0.6
        
        // Continuous color gradient based on position (hue wave)
        const hueOffset = (i / barCount) * 360
        const hue = (hueShift + hueOffset) % 360
        const saturation = 100 - (20 * Math.sin((i / barCount) * Math.PI))
        const volumeModifier = 0.3 + (volumeRef.current * 0.4)
        
        ctx.fillStyle = `hsla(${hue}, ${saturation}%, ${55 + value / 255 * 15}%, ${volumeModifier + value / 300})`
        ctx.fillRect(barPosition, visualHeight - barHeight, barWidth, barHeight)
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    draw()
  }

  const beginPlayback = async () => {
    setupAudioAnalyzer()
    if (ctxRef.current?.state === 'suspended') {
      await ctxRef.current.resume()
    }

    if (audioRef.current) {
      try {
        if (!audioRef.current.src || audioRef.current.src.trim() === '') {
          setMessage('No audio source loaded for current song')
          return
        }

        const audio = audioRef.current
        if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
          await audio.play()
        } else {
          await new Promise<void>((resolve, reject) => {
            const onCanPlay = () => {
              audio.removeEventListener('canplay', onCanPlay)
              audio.removeEventListener('error', onError)
              resolve()
            }
            const onError = () => {
              audio.removeEventListener('canplay', onCanPlay)
              audio.removeEventListener('error', onError)
              reject(new Error('Audio failed while loading'))
            }

            audio.addEventListener('canplay', onCanPlay, { once: true })
            audio.addEventListener('error', onError, { once: true })
            setTimeout(() => {
              audio.removeEventListener('canplay', onCanPlay)
              audio.removeEventListener('error', onError)
              resolve()
            }, 1200)
          })
          await audio.play()
        }
        setMessage('Playback running')
      } catch (error) {
        console.error('Playback error:', error)
        const src = audioRef.current.currentSrc || audioRef.current.src || 'none'
        setMessage(`Could not play: ${error instanceof Error ? error.message : 'Unknown error'} | src: ${src}`)
      }
    }
    if (!rafRef.current) {
      animateBackground()
    }
  }

  const togglePlayPause = async () => {
    if (!audioRef.current) {
      return
    }

    if (isPlaying) {
      audioRef.current.pause()
      stopVisualizerAnimation()
    } else {
      await beginPlayback()
    }
  }

  const handleProgressChange = (newTime: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = newTime
      setCurrentTime(newTime)
    }
  }

  const handlePitchChange = (delta: number) => {
    postState('/player/pitch', { delta })
  }

  const formatTime = (seconds: number) => {
    if (!seconds || isNaN(seconds)) return '00:00'
    const mins = Math.floor(seconds / 60)
    const secs = Math.floor(seconds % 60)
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`
  }

  useEffect(() => {
    selectedPlaylistRef.current = selectedPlaylist
  }, [selectedPlaylist])

  useEffect(() => {
    const requestId = ++listLoadRequestRef.current
    fetch(`${API_BASE}/playlist/select-songs`, { method: 'POST' })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error('Could not load songs')
        }

        if (requestId !== listLoadRequestRef.current) {
          return
        }

        const data = (await response.json()) as PlaylistState

        if (requestId !== listLoadRequestRef.current || selectedPlaylistRef.current) {
          return
        }

        setPlaylist(data.songs || [])
        playlistRef.current = data.songs || []
        setCurrent(data.current || null)
        const initialSongs = data.songs || []
        if (initialSongs.length > 0) {
          const idx = resolveCurrentIndex(initialSongs, data.current || null)
          currentPositionRef.current = idx
          activeIndexRef.current = idx
          currentIndexRef.current = idx
        } else {
          currentPositionRef.current = -1
          activeIndexRef.current = -1
          currentIndexRef.current = -1
        }
      })
      .catch(() => refreshState().catch(() => setMessage('Could not load API')))
    // Initialize static background
    stopVisualizerAnimation()
  }, [])

  useEffect(() => {
    const pendingSongs = playlist.filter(
      (song) => song.audio_url.startsWith('/') && (!song.duration || song.duration === '00:00'),
    )
    if (pendingSongs.length === 0) {
      return
    }

    let cancelled = false

    const hydrateDurations = async () => {
      const updates = new Map<string, string>()
      for (const song of pendingSongs) {
        const seconds = await probeSongDuration(song.audio_url)
        if (seconds > 0 && Number.isFinite(seconds)) {
          updates.set(song.audio_url, formatTime(seconds))
        }
      }

      if (cancelled || updates.size === 0) {
        return
      }

      setPlaylist((prev) =>
        prev.map((song) => {
          const nextDuration = updates.get(song.audio_url)
          if (!nextDuration) return song
          if (song.duration && song.duration !== '00:00') return song
          return { ...song, duration: nextDuration }
        }),
      )

      setCurrent((prev) => {
        if (!prev) return prev
        const nextDuration = updates.get(prev.audio_url)
        if (!nextDuration) return prev
        return { ...prev, duration: nextDuration }
      })
    }

    hydrateDurations().catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [playlist])

  useEffect(() => {
    if (!current || !duration || !Number.isFinite(duration) || duration <= 0) {
      return
    }

    const formatted = formatTime(duration)
    if (current.duration !== formatted) {
      setCurrent((prev) => (prev ? { ...prev, duration: formatted } : prev))
      setPlaylist((prev) =>
        prev.map((song) =>
          song.audio_url === current.audio_url && song.audio_url.startsWith('/')
            ? { ...song, duration: formatted }
            : song,
        ),
      )
    }
  }, [duration, current])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume
      volumeRef.current = volume
    }
  }, [volume])

  useEffect(() => {
    if (!audioRef.current || !current) {
      return
    }

    if (skipCurrentSyncRef.current) {
      audioRef.current.playbackRate = current.pitch
      setLocalPitch(current.pitch)
      return
    }

    const isAutoPlayTransition = autoPlayPendingRef.current
    const nextSrc = toPlayableUrl(current.audio_url)
    const resolvedNextSrc = new URL(nextSrc, window.location.href).href
    const currentSrc = audioRef.current.currentSrc || audioRef.current.src
    if (currentSrc !== resolvedNextSrc) {
      audioRef.current.src = resolvedNextSrc
      audioRef.current.load()
      if (!isAutoPlayTransition) {
        setIsPlaying(false)
        setCurrentTime(0)
        setMessage('Track ready. Press Play.')
      }
    }
    audioRef.current.playbackRate = current.pitch
    setLocalPitch(current.pitch)

  }, [current])

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) {
      return
    }

    const onError = () => {
      const songs = playlistRef.current
      if (!songs || songs.length === 0) {
        setMessage('Audio failed to load. No songs available.')
        return
      }

      setMessage('Audio failed to load. Trying next available track...')
      const idx =
        currentPositionRef.current >= 0 && currentPositionRef.current < songs.length
          ? currentPositionRef.current
          : (
        activeIndexRef.current >= 0 && activeIndexRef.current < songs.length
          ? activeIndexRef.current
          : currentIndexRef.current
          )
      const startIndex = idx >= 0 && idx < songs.length - 1 ? idx + 1 : 0
      playFirstAvailableFrom(startIndex, 1, songs).catch(() => {
        setMessage('Audio failed to load. Check URL format or server access.')
      })
    }
    const onCanPlay = () => {
      if (!autoPlayPendingRef.current && !isPlaying) {
        setMessage('Track ready. Press Play.')
      }
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration)
      }
    }
    const onPlay = () => {
      setupAudioAnalyzer()
      if (ctxRef.current?.state === 'suspended') {
        void ctxRef.current.resume()
      }
      setIsPlaying(true)
      isPlayingRef.current = true
    }
    const onPause = () => {
      setIsPlaying(false)
      isPlayingRef.current = false
    }
    const onEnded = () => {
      setIsPlaying(false)
      isPlayingRef.current = false
      const songs = playlistRef.current
      if (songs.length > 0) {
        const idx =
          currentPositionRef.current >= 0 && currentPositionRef.current < songs.length
            ? currentPositionRef.current
            : (
          activeIndexRef.current >= 0 && activeIndexRef.current < songs.length
            ? activeIndexRef.current
            : currentIndexRef.current
            )
        const startIndex = idx >= 0 && idx < songs.length - 1 ? idx + 1 : 0
        playFirstAvailableFrom(startIndex, 1, songs).catch(() => {
          setMessage('Could not continue playlist')
        })
      }
    }
    const onTimeUpdate = () => setCurrentTime(audio.currentTime)
    const onLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration)
      }
    }

    audio.addEventListener('error', onError)
    audio.addEventListener('canplay', onCanPlay)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('ended', onEnded)
    audio.addEventListener('timeupdate', onTimeUpdate)
    audio.addEventListener('loadedmetadata', onLoadedMetadata)

    return () => {
      audio.removeEventListener('error', onError)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('ended', onEnded)
      audio.removeEventListener('timeupdate', onTimeUpdate)
      audio.removeEventListener('loadedmetadata', onLoadedMetadata)
    }
  }, [])

  useEffect(() => {
    isPlayingRef.current = isPlaying
    if (isPlaying && !rafRef.current) {
      animateBackground()
    }
  }, [isPlaying])

  useEffect(() => {
    playlistRef.current = playlist
    if (playlist.length === 0) {
      currentIndexRef.current = -1
      currentPositionRef.current = -1
      activeIndexRef.current = -1
      return
    }

    const stableCursor =
      currentPositionRef.current >= 0 && currentPositionRef.current < playlist.length

    if (stableCursor) {
      currentIndexRef.current = currentPositionRef.current
      if (activeIndexRef.current < 0 || activeIndexRef.current >= playlist.length) {
        activeIndexRef.current = currentPositionRef.current
      }
      return
    }

    const sourceIndex = resolvePlayingIndexFromAudioElement(playlist)
    if (sourceIndex >= 0) {
      currentPositionRef.current = sourceIndex
      activeIndexRef.current = sourceIndex
      currentIndexRef.current = sourceIndex
      return
    }

    if (currentIndex >= 0) {
      currentPositionRef.current = currentIndex
      activeIndexRef.current = currentIndex
      currentIndexRef.current = currentIndex
    }
  }, [playlist, currentIndex])

  useEffect(() => {
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current)
      }
      ctxRef.current?.close().catch(() => undefined)
    }
  }, [])

  useEffect(() => {
    const handleMouseUp = () => setIsDraggingProgress(false)
    const handleTouchEnd = () => setIsDraggingProgress(false)
    
    window.addEventListener('mouseup', handleMouseUp)
    window.addEventListener('touchend', handleTouchEnd)
    
    return () => {
      window.removeEventListener('mouseup', handleMouseUp)
      window.removeEventListener('touchend', handleTouchEnd)
    }
  }, [])

  return (
    <>
      <audio ref={audioRef} style={{ display: 'none' }} />
      <canvas ref={canvasRef} className="visualizer-bg" style={{ pointerEvents: 'none' }} />
      
      {currentPage === 'playlists' ? (
        <PlaylistsPage 
          onNavigateBack={() => setCurrentPage('player')}
          onPlaylistSelect={loadSelectedPlaylist}
        />
      ) : (
        <div className="page">
          <main className="shell">
            <header className="hero">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>Vibe Check</h1>
                <button onClick={() => setCurrentPage('playlists')} style={{ marginTop: 0 }}>
                  <FaList /> My Playlists
                </button>
              </div>
            </header>

            <div className="columns-container">
        <section className="panel current-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h2>{selectedPlaylist ? `🎵 ${selectedPlaylist}` : 'Now Playing'}</h2>
            {selectedPlaylist && (
              <button 
                onClick={closePlaylist}
                style={{ 
                  padding: '0.4rem 0.8rem', 
                  fontSize: '0.85rem',
                  background: 'rgba(99, 102, 241, 0.2)',
                  border: '1px solid rgba(99, 102, 241, 0.4)'
                }}
              >
                ✕ Close Playlist
              </button>
            )}
          </div>
          <p className="title">{current ? `${current.title} - ${current.artist}` : 'No track selected'}</p>
          <p className="meta">Duration {current?.duration ?? '--:--'} | Pitch x{current?.pitch?.toFixed(2) ?? '1.00'}</p>

          <div style={{ display: 'flex', justifyContent: 'center', marginTop: '1.2rem' }}>
            <div className={`vinyl-record ${isPlaying && current ? 'playing' : ''}`} />
          </div>

          <div className="waveform-container">
            {[...Array(32)].map((_, i) => {
              const dataIndex = Math.floor((i / 32) * (waveformDataRef.current?.length || 0))
              const value = (waveformDataRef.current?.[dataIndex] || 0) / 255
              return (
                <div
                  key={i}
                  className="waveform-bar"
                  style={{
                    height: `${20 + value * 80}%`,
                  }}
                />
              )
            })}
          </div>

          <div
            ref={progressRef}
            className="progress-container"
            onMouseDown={() => setIsDraggingProgress(true)}
            onTouchStart={() => setIsDraggingProgress(true)}
            onMouseUp={() => setIsDraggingProgress(false)}
            onTouchEnd={() => setIsDraggingProgress(false)}
            onMouseMove={(e) => {
              if (isDraggingProgress && progressRef.current) {
                const rect = progressRef.current.getBoundingClientRect()
                const newTime = ((e.clientX - rect.left) / rect.width) * duration
                handleProgressChange(Math.max(0, Math.min(newTime, duration)))
              }
            }}
            onTouchMove={(e) => {
              if (isDraggingProgress && progressRef.current) {
                const touch = e.touches[0]
                const rect = progressRef.current.getBoundingClientRect()
                const newTime = ((touch.clientX - rect.left) / rect.width) * duration
                handleProgressChange(Math.max(0, Math.min(newTime, duration)))
              }
            }}
          >
            <div
              className="progress-bar"
              style={{
                width: duration > 0 ? `${(currentTime / duration) * 100}%` : '0%',
              }}
              onClick={(e) => {
                const rect = e.currentTarget.parentElement?.getBoundingClientRect()
                if (rect) {
                  const newTime = ((e.clientX - rect.left) / rect.width) * duration
                  handleProgressChange(newTime)
                }
              }}
            />
          </div>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '0.5rem',
              fontSize: '0.8rem',
              color: 'var(--muted)',
            }}
          >
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          <div className="row">
            <button onClick={() => playPrevious().catch(() => undefined)}><FaStepBackward /> Previous</button>
            <button onClick={togglePlayPause}>{isPlaying ? <><FaPause /> Pause</> : <><FaPlay /> Play</>}</button>
            <button onClick={() => playNext().catch(() => undefined)}>Next <FaStepForward /></button>
          </div>

          <div className="pitch-slider-container">
            <label>Pitch</label>
            <input
              type="range"
              min="0.5"
              max="2"
              step="0.1"
              value={localPitch}
              onChange={(e) => {
                const newPitch = parseFloat(e.target.value)
                setLocalPitch(newPitch)
                if (audioRef.current) {
                  audioRef.current.playbackRate = newPitch
                }
              }}
              onMouseUp={(e) => {
                const newPitch = parseFloat(e.currentTarget.value)
                handlePitchChange(newPitch - (current?.pitch ?? 1))
              }}
              onTouchEnd={(e) => {
                const newPitch = parseFloat(e.currentTarget.value)
                handlePitchChange(newPitch - (current?.pitch ?? 1))
              }}
              className="pitch-slider"
            />
            <span style={{ fontSize: '0.9rem', minWidth: '40px' }}>x{localPitch.toFixed(2)}</span>
          </div>

          <div className="pitch-slider-container">
            <label>Volume</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(e) => {
                const newVolume = parseFloat(e.target.value)
                setVolume(newVolume)
              }}
              className="pitch-slider"
            />
            <span style={{ fontSize: '0.9rem', minWidth: '40px' }}>{Math.round(volume * 100)}%</span>
          </div>

          <div className="row">
            <button
              onClick={async () => {
                if (!current) {
                  setMessage('No song selected to download.')
                  return
                }
                try {
                  setMessage('Downloading...')
                  // For YouTube URLs, open in new window
                  if (current.audio_url.includes('youtube') || current.audio_url.includes('youtu.be')) {
                    window.open(current.audio_url, '_blank')
                    setMessage(`Opened: ${current.title}`)
                    return
                  }
                  // For local files, download directly
                  const response = await fetch(current.audio_url)
                  if (!response.ok) {
                    setMessage('Download failed.')
                    return
                  }
                  
                  const blob = await response.blob()
                  const url = window.URL.createObjectURL(blob)
                  const link = document.createElement('a')
                  link.href = url
                  link.download = `${current.artist}_${current.title}.mp3`
                  document.body.appendChild(link)
                  link.click()
                  document.body.removeChild(link)
                  window.URL.revokeObjectURL(url)
                  setMessage(`Downloaded: ${current.title}`)
                } catch (error) {
                  setMessage(`Download error: ${error}`)
                }
              }}
            >
              <FaDownload /> Download Current
            </button>
            <button onClick={() => selectedPlaylist && postState(`/playlists/${encodeURIComponent(selectedPlaylist)}/sort`, { sortBy: 'title' })}><FaSort /> Sort by Title</button>
            <button onClick={() => selectedPlaylist && postState(`/playlists/${encodeURIComponent(selectedPlaylist)}/sort`, { sortBy: 'artist' })}><FaSort /> Sort by Artist</button>
          </div>
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
        <section className="panel list-panel">
          <h2>{selectedPlaylist ? `${selectedPlaylist} (${playlist.length})` : `Songs (${playlist.length})`}</h2>
          <ul>
            {playlist.map((song, index) => (
              <li key={`${song.title}-${song.artist}-${index}`} className={song.audio_url === current?.audio_url ? 'active song-row-active' : 'song-row'} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.8rem', gap: '0.5rem' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong style={{ display: 'block' }}>{index + 1}. {song.title}</strong>
                  <small>
                    {song.artist} | {song.duration} | x{song.pitch.toFixed(2)}
                  </small>
                </div>
                <div className="row compact" style={{ display: 'flex', gap: '0.3rem', flexShrink: 0 }}>
                  {index > 0 && (
                    <button
                      onClick={() => moveSongInPlaylist(index, index - 1)}
                      title="Move up"
                      style={{
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.85rem',
                      }}
                    >
                      ↑
                    </button>
                  )}
                  {index < playlist.length - 1 && (
                    <button
                      onClick={() => moveSongInPlaylist(index, index + 1)}
                      title="Move down"
                      style={{
                        padding: '0.4rem 0.6rem',
                        fontSize: '0.85rem',
                      }}
                    >
                      ↓
                    </button>
                  )}
                  <button
                    onClick={() => {
                      playWithAnalyzerFallback(song, index, playlist).catch(() => undefined)
                    }}
                    title="Play"
                    style={{
                      padding: '0.4rem 0.6rem',
                      fontSize: '0.85rem',
                      minWidth: '4.5rem',
                    }}
                  >
                    <FaPlay /> Play
                  </button>
                  <button
                    className="danger"
                    onClick={() => removeSongFromPlaylist(index, song.title)}
                    title="Remove from songs"
                    style={{
                      padding: '0.4rem 0.6rem',
                      fontSize: '0.85rem',
                    }}
                  >
                    <FaTrash />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="panel add-panel">
          <h2>Upload Local Music</h2>
          <div
            className="upload-zone"
            style={{
              border: `2px dashed ${isDraggingFiles ? '#4CAF50' : 'var(--border)'}`,
              borderRadius: '8px',
              padding: '2rem',
              textAlign: 'center',
              cursor: 'pointer',
              transition: 'all 0.3s ease',
              backgroundColor: isDraggingFiles ? 'rgba(76, 175, 80, 0.1)' : 'transparent',
            }}
            onDragOver={(e) => {
              e.preventDefault()
              setIsDraggingFiles(true)
            }}
            onDragLeave={() => setIsDraggingFiles(false)}
            onDrop={(e) => {
              e.preventDefault()
              setIsDraggingFiles(false)
              const files = Array.from(e.dataTransfer.files).filter((file) =>
                file.type.startsWith('audio/'),
              )
              setLocalFiles((prev) => [...prev, ...files])
            }}
          >
            <input
              type="file"
              multiple
              accept="audio/*"
              id="file-input"
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = Array.from(e.currentTarget.files || [])
                setLocalFiles((prev) => [...prev, ...files])
              }}
            />
            <label htmlFor="file-input" style={{ cursor: 'pointer', display: 'block' }}>
              <p style={{ marginBottom: '0.5rem' }}>Drag and drop audio files here</p>
              <small style={{ color: 'var(--muted)' }}>Supported: MP3, WAV, FLAC, OGG</small>
            </label>
          </div>

          <button
            onClick={() => document.getElementById('file-input')?.click()}
            style={{ width: '100%', marginTop: '1rem' }}
          >
            <FaPlus /> Browse Files
          </button>

          {localFiles.length > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h3 style={{ fontSize: '0.95rem', marginBottom: '0.5rem' }}>Selected Files:</h3>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {localFiles.map((file, index) => (
                  <li
                    key={index}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '0.5rem',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <span style={{ fontSize: '0.9rem' }}>{file.name}</span>
                    <button
                      onClick={() => setLocalFiles((prev) => prev.filter((_, i) => i !== index))}
                      className="danger"
                      style={{ padding: '0.3rem 0.6rem', fontSize: '0.85rem' }}
                    >
                      <FaTrash />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

            <div className="row" style={{ marginTop: '1rem' }}>
              <button
                onClick={async () => {
                  if (localFiles.length === 0) {
                    setMessage('No files selected to upload.')
                    return
                  }

                  try {
                    setMessage('Uploading files...')
                    const formData = new FormData()
                    localFiles.forEach((file) => {
                      formData.append('files', file)
                    })

                    const response = await fetch(`${API_BASE}/playlist/upload-local`, {
                      method: 'POST',
                      body: formData,
                    })

                    if (!response.ok) {
                      const error = await response.json()
                      setMessage(error.detail || 'Upload failed')
                      return
                    }

                    const data = await response.json() as { songs: Song[]; songs_added: number }
                    
                    if (data.songs && Array.isArray(data.songs) && data.songs.length > 0) {
                      setSelectedPlaylist(null)
                      const refreshResponse = await fetch(`${API_BASE}/playlist/select-songs`, { method: 'POST' })
                      if (refreshResponse.ok) {
                        const listData = await refreshResponse.json() as PlaylistState
                        setPlaylist(Array.isArray(listData.songs) ? listData.songs : [])
                        if (!current && listData.songs && listData.songs.length > 0) {
                          setCurrent(listData.songs[0])
                        }
                      }
                      setLocalFiles([])
                      setMessage(`Successfully uploaded ${data.songs_added} file(s) to songs`)
                    }
                  } catch (error) {
                    const errorMsg = error instanceof Error ? error.message : String(error)
                    setMessage(`Upload error: ${errorMsg}`)
                  }
                }}
                disabled={localFiles.length === 0}
              >
                <FaPlus /> Upload Music
              </button>
             <button
               onClick={() => setLocalFiles([])}
               disabled={localFiles.length === 0}
             >
               <FaTrash /> Clear Selection
             </button>
             </div>
           </section>
         </div>

           <section className={`panel queue-panel ${selectedPlaylist ? 'queue-panel-compact' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: selectedPlaylist ? '0.8rem' : '1.5rem' }}>
           {/* Up Next Section */}
           <div style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '1rem' }}>
             <h2>Up Next</h2>
             {queueSongs.length === 0 ? (
               <p style={{ color: 'var(--muted)', margin: 0, marginTop: '0.5rem' }}>
                 No songs queued. Add more songs or navigate the playlist.
               </p>
              ) : (
                <div className="queue-list" style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', marginTop: '0.45rem' }}>
                   {queueSongs.map((song, index) => (
                     <div
                       key={`${song.title}-${index}`}
                       className={`queue-item ${selectedPlaylist ? 'queue-item-compact' : ''}`}
                       onClick={() => {
                        // If a playlist is loaded, handle selection locally
                        if (selectedPlaylist) {
                          const targetIndex = resolveCurrentIndex(playlist, song)
                          playWithAnalyzerFallback(
                            song,
                            targetIndex >= 0 ? targetIndex : undefined,
                            playlist,
                          ).catch(() => undefined)
                        } else {
                          // Otherwise use backend endpoint
                          if (song.id) {
                            postState(`/player/select-id/${encodeURIComponent(song.id)}`)
                          } else {
                            postState(`/player/select/${encodeURIComponent(song.title)}`)
                          }
                        }
                      }}
                    >
                       <div className="queue-item-text">
                         <p className="queue-item-title">{index + 1}. {song.title}</p>
                         <p className="queue-item-artist">{song.artist}</p>
                       </div>
                      <div className="queue-item-duration">{song.duration}</div>
                    </div>
                  ))}
               </div>
              )}
           </div>
         </section>
        </div>

             <footer className="status">
               {message}
               {navDebug ? (
                 <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', opacity: 0.9, wordBreak: 'break-word' }}>
                   {navDebug}
                 </div>
               ) : null}
             </footer>
           </main>
         </div>
       )}
     </>
   )
 }
 
 export default App
