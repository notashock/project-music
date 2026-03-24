import { useState, useEffect, useRef } from 'react';
import './App.css';

const SERVER_URL = 'http://localhost:5000'; // 🚀 Remember to change this to your network IP for mobile testing

function App() {
  const [songs, setSongs] = useState([]);
  const [roots, setRoots] = useState([]);
  const [currentSong, setCurrentSong] = useState(null);
  const [newRootPath, setNewRootPath] = useState('');
  const [scanStatus, setScanStatus] = useState('Idle');
  
  // 🚀 NEW: Duplicate Management State
  const [duplicates, setDuplicates] = useState([]);
  const [showDuplicateModal, setShowDuplicateModal] = useState(false);

  const audioRef = useRef(null);

  useEffect(() => {
    fetchRoots();
    fetchSongs();
  }, []);

  // --- API CALLS ---
  const fetchRoots = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/roots`);
      const data = await res.json();
      setRoots(data);
    } catch (err) { console.error("Failed to fetch roots:", err); }
  };

  const fetchSongs = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/songs`);
      const data = await res.json();
      setSongs(data);
    } catch (err) { console.error("Failed to fetch songs:", err); }
  };

  const handleAddRoot = async () => {
    if (!newRootPath) return alert("Enter a path first!");
    try {
      const res = await fetch(`${SERVER_URL}/api/roots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetPath: newRootPath })
      });
      const data = await res.json();
      alert(data.message || data.error);
      setNewRootPath('');
      fetchRoots();
    } catch (err) { console.error(err); }
  };

  const handleStageScan = async () => {
    setScanStatus('Scanning...');
    try {
      const res = await fetch(`${SERVER_URL}/api/songs/scan/stage`, { method: 'POST' });
      const data = await res.json();
      setScanStatus(`${data.message} (${data.newSongsStaged || 0} found)`);
    } catch (err) { 
      console.error(err); 
      setScanStatus('Scan failed.');
    }
  };

  const handleConfirmScan = async () => {
    try {
      await fetch(`${SERVER_URL}/api/songs/scan/confirm`, { method: 'POST' });
      setScanStatus('Library Updated!');
      fetchSongs(); 
    } catch (err) { console.error(err); }
  };

  // 🚀 NEW: Fetch Duplicates
  const handleFindDuplicates = async () => {
    try {
      const res = await fetch(`${SERVER_URL}/api/songs/duplicates`);
      const data = await res.json();
      setDuplicates(data);
      setShowDuplicateModal(true);
    } catch (err) { console.error("Failed to fetch duplicates:", err); }
  };

  // 🚀 NEW: Delete a specific duplicate file
  const handleDeleteSong = async (songId) => {
    if (!window.confirm("Are you sure you want to delete this file from the database and remove its thumbnail?")) return;
    try {
      await fetch(`${SERVER_URL}/api/songs/${songId}`, { method: 'DELETE' });
      // Refresh both the duplicates list and the main library
      handleFindDuplicates();
      fetchSongs();
    } catch (err) { console.error("Failed to delete song:", err); }
  };

  // --- PLAYBACK ---
  const playSong = (song) => {
    setCurrentSong(song);
    setTimeout(() => {
      if (audioRef.current) {
        audioRef.current.play();
      }
    }, 50);
  };

  return (
    <div className="app-container">
      
      {/* MAIN CONTENT AREA */}
      <div className="main-content">
        
        {/* LEFT PANEL: Library */}
        <div className="panel library-panel">
          <h2>🎧 Your Library ({songs.length})</h2>
          <button onClick={fetchSongs} style={{ width: '150px', marginBottom: '15px' }}>Refresh</button>
          
          <div className="song-list">
            {songs.map(song => (
              <div key={song._id} className="song-item" onClick={() => playSong(song)}>
                <img 
                  src={`${SERVER_URL}/api/thumbs/${song._id}`} 
                  onError={(e) => { e.target.src = 'https://via.placeholder.com/50' }} 
                  alt="thumbnail" 
                />
                <div className="song-info">
                  <span className="song-title">{song.title}</span>
                  <span className="song-artist">{song.artist}</span>
                </div>
              </div>
            ))}
            {songs.length === 0 && <p style={{ color: '#aaa' }}>No songs found. Try scanning your folders!</p>}
          </div>
        </div>

        {/* RIGHT PANEL: Settings */}
        <div className="panel settings-panel">
          <h2>📁 Folders & Sync</h2>
          
          <div style={{ marginBottom: '30px' }}>
            <input 
              type="text" 
              placeholder="e.g. C:\Users\Music" 
              value={newRootPath}
              onChange={(e) => setNewRootPath(e.target.value)}
            />
            <button onClick={handleAddRoot}>Add Root Folder</button>
            <div style={{ marginTop: '10px', fontSize: '0.9rem', color: '#aaa' }}>
              {roots.map(r => <div key={r._id}>✅ {r.path}</div>)}
            </div>
          </div>

          <div style={{ marginBottom: '30px' }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem' }}>Library Scanner</h3>
            <button onClick={handleStageScan}>1. Stage Global Scan</button>
            <button className="btn-danger" onClick={handleConfirmScan}>2. Confirm & Save</button>
            <p style={{ color: '#03dac6', fontSize: '0.9rem', textAlign: 'center' }}>
              Status: {scanStatus}
            </p>
          </div>

          {/* 🚀 NEW: Duplicate Hunter Button */}
          <div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '1.1rem' }}>Maintenance</h3>
            <button style={{ background: '#ff9800', color: '#fff' }} onClick={handleFindDuplicates}>
              🔍 Find Duplicates
            </button>
          </div>

        </div>
      </div>

      {/* BOTTOM PANEL: Player */}
      <div className="player-bar">
        <div className="now-playing">
          {currentSong ? (
            <>
              <img src={`${SERVER_URL}/api/thumbs/${currentSong._id}`} alt="playing" />
              <div className="song-info">
                <span className="song-title">{currentSong.title}</span>
                <span className="song-artist">{currentSong.artist}</span>
              </div>
            </>
          ) : (
            <span style={{ color: '#aaa' }}>Select a song to play...</span>
          )}
        </div>
        
        <audio 
          ref={audioRef}
          controls 
          src={currentSong ? `${SERVER_URL}/stream?id=${currentSong._id}` : ''}
        />
        <div style={{ width: '300px' }}></div> 
      </div>

      {/* 🚀 NEW: DUPLICATE MANAGER MODAL */}
      {showDuplicateModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333', paddingBottom: '10px', marginBottom: '20px' }}>
              <h2 style={{ margin: 0, border: 'none', padding: 0 }}>Duplicate Hunter</h2>
              <button onClick={() => setShowDuplicateModal(false)} style={{ width: 'auto', margin: 0, background: 'transparent', color: '#fff', fontSize: '1.5rem' }}>✖</button>
            </div>

            {duplicates.length === 0 ? (
              <p style={{ color: '#03dac6', textAlign: 'center' }}>✨ Your library is perfectly clean! No duplicates found.</p>
            ) : (
              <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
                <p style={{ color: '#aaa', marginBottom: '20px' }}>Found {duplicates.length} groups of identical songs. Choose which versions to keep.</p>
                
                {duplicates.map((group, index) => (
                  <div key={index} style={{ background: '#2a2a2a', padding: '15px', borderRadius: '8px', marginBottom: '15px' }}>
                    <h4 style={{ margin: '0 0 10px 0', color: '#bb86fc' }}>{group._id.title} <span style={{ color: '#aaa', fontSize: '0.8rem' }}>by {group._id.artist}</span></h4>
                    
                    {group.songs.map(song => (
                      <div key={song._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#1e1e1e', padding: '10px', borderRadius: '5px', marginBottom: '5px' }}>
                        <div style={{ fontSize: '0.8rem', color: '#ccc', wordBreak: 'break-all', paddingRight: '15px' }}>
                          📂 {song.relative_path}
                        </div>
                        <button className="btn-danger" style={{ width: '80px', margin: 0, padding: '5px' }} onClick={() => handleDeleteSong(song._id)}>
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

export default App;