/**
 * SonicField SSE Client
 * Connects to the server's /stream endpoint and dispatches SFEvents.
 *
 * Auto-reconnects on disconnect (browser EventSource handles this natively).
 * Emits events on a target EventTarget so the audio engine and UI can subscribe.
 */

export class SSEClient extends EventTarget {
  /**
   * @param {string} url - SSE endpoint (e.g. 'http://localhost:3000/stream?match_id=123')
   */
  constructor(url) {
    super();
    this.url    = url;
    this.source = null;
    this.status = 'disconnected'; // 'connecting' | 'connected' | 'error' | 'disconnected'
  }

  connect() {
    if (this.source) this.disconnect();

    this.status = 'connecting';
    this._emitStatus();

    this.source = new EventSource(this.url);

    this.source.addEventListener('open', () => {
      this.status = 'connected';
      this._emitStatus();
    });

    // Main event stream
    this.source.addEventListener('event', (msg) => {
      try {
        const ev = JSON.parse(msg.data);
        this.dispatchEvent(new CustomEvent('sf-event', { detail: ev }));
      } catch (e) {
        console.error('[SSEClient] Failed to parse event:', e, msg.data);
      }
    });

    // Heartbeat (keep-alive)
    this.source.addEventListener('heartbeat', () => {
      this.dispatchEvent(new CustomEvent('heartbeat'));
    });

    this.source.addEventListener('error', () => {
      this.status = 'error';
      this._emitStatus();
      // EventSource auto-reconnects; no manual action needed
    });
  }

  disconnect() {
    if (this.source) {
      this.source.close();
      this.source = null;
    }
    this.status = 'disconnected';
    this._emitStatus();
  }

  _emitStatus() {
    this.dispatchEvent(new CustomEvent('status', { detail: this.status }));
  }

  get connected() { return this.status === 'connected'; }
}
