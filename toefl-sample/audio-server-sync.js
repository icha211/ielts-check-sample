/**
 * TOEFL Audio Server Sync Module
 * Handles uploading/downloading audio files from the data storage server
 * Enables audio to be accessed across different machines and browsers
 */

const AUDIO_SERVER = {
  host: localStorage.getItem('toefl_storage_server_host') || '127.0.0.1',
  port: localStorage.getItem('toefl_storage_server_port') || '8788',
  
  /**
   * Get the base URL for the storage server
   */
  getBaseUrl() {
    return `http://${this.host}:${this.port}`;
  },
  
  /**
   * Set the storage server host (for configuration)
   */
  setServerHost(host, port = '8788') {
    this.host = host;
    this.port = port;
    localStorage.setItem('toefl_storage_server_host', host);
    localStorage.setItem('toefl_storage_server_port', port);
  },
  
  /**
   * Upload audio blob to server
   * @param {string} setId - The set ID
   * @param {Blob|File} audioBlob - The audio file
   * @param {number} partId - The part ID (default: 1)
   * @returns {Promise<boolean>} Success status
   */
  async uploadAudio(setId, audioBlob, partId = 1) {
    try {
      if (!setId || !audioBlob) {
        console.warn('[AudioServerSync] Missing setId or audioBlob');
        return false;
      }

      // Convert blob to base64
      const base64Data = await this._blobToBase64(audioBlob);
      const base64String = base64Data.split(',')[1] || base64Data;

      const payload = {
        action: 'save-audio',
        setId: setId,
        partId: Number(partId || 1),
        audioData: base64String
      };

      const response = await fetch(`${this.getBaseUrl()}/api/problems`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        console.warn(`[AudioServerSync] Upload failed: ${response.status}`);
        return false;
      }

      const result = await response.json();
      console.log('[AudioServerSync] Audio uploaded successfully', { setId, partId });
      return result.success === true;
    } catch (error) {
      console.warn('[AudioServerSync] Upload error:', error);
      return false;
    }
  },
  
  /**
   * Download audio from server
   * @param {string} setId - The set ID
   * @param {number} partId - The part ID (default: 1)
   * @returns {Promise<Blob|null>} Audio blob or null if not found
   */
  async downloadAudio(setId, partId = 1) {
    try {
      if (!setId) {
        console.warn('[AudioServerSync] Missing setId');
        return null;
      }

      const url = `${this.getBaseUrl()}/api/audio/download/${encodeURIComponent(setId)}/${Number(partId || 1)}`;
      
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'Accept': 'audio/mpeg' }
      });

      if (!response.ok) {
        console.warn(`[AudioServerSync] Download failed: ${response.status}`);
        return null;
      }

      const blob = await response.blob();
      console.log('[AudioServerSync] Audio downloaded successfully', { setId, partId });
      return blob;
    } catch (error) {
      console.warn('[AudioServerSync] Download error:', error);
      return null;
    }
  },
  
  /**
   * Check if server is reachable
   * @returns {Promise<boolean>} Server availability
   */
  async isServerAvailable() {
    try {
      const response = await fetch(`${this.getBaseUrl()}/api/problems`, {
        method: 'OPTIONS',
        signal: AbortSignal.timeout(3000)
      });
      return response.ok;
    } catch (error) {
      console.warn('[AudioServerSync] Server unreachable:', error.message);
      return false;
    }
  },
  
  /**
   * Convert blob to base64 data URL
   * @private
   */
  _blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
};

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AUDIO_SERVER;
}
