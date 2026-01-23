// Chipku Client Application
class ChipkuApp {
  constructor() {
    this.ws = null;
    this.currentUser = null;
    this.roomId = null;
    this.roomName = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 15;
    this.reconnectDelay = 2000;
    this.isConnecting = false;

    this.init();
  }

  init() {
    this.bindElements();
    this.bindEvents();
    this.checkUrlForRoomId();
  }

  bindElements() {
    // Pages
    this.landingPage = document.getElementById('landing-page');
    this.roomPage = document.getElementById('room-page');

    // Landing buttons
    this.btnCreate = document.getElementById('btn-create');
    this.btnJoin = document.getElementById('btn-join');

    // Create modal
    this.createModal = document.getElementById('create-modal');
    this.createModalClose = document.getElementById('create-modal-close');
    this.roomNameInput = document.getElementById('room-name-input');
    this.btnCreateConfirm = document.getElementById('btn-create-confirm');

    // Join modal
    this.joinModal = document.getElementById('join-modal');
    this.joinModalClose = document.getElementById('join-modal-close');
    this.roomIdInput = document.getElementById('room-id-input');
    this.joinError = document.getElementById('join-error');
    this.btnJoinConfirm = document.getElementById('btn-join-confirm');

    // Room elements
    this.roomNameDisplay = document.getElementById('room-name-display');
    this.roomIdDisplay = document.getElementById('room-id-display');
    this.btnCopyId = document.getElementById('btn-copy-id');
    this.userCount = document.getElementById('user-count');
    this.userLabel = document.getElementById('user-label');
    this.btnLeave = document.getElementById('btn-leave');
    this.pasteFeed = document.getElementById('paste-feed');
    this.emptyState = document.getElementById('empty-state');
    this.pasteInput = document.getElementById('paste-input');
    this.btnSend = document.getElementById('btn-send');

    // Toast
    this.toast = document.getElementById('toast');
  }

  bindEvents() {
    // Landing page
    this.btnCreate.addEventListener('click', () => this.showModal(this.createModal));
    this.btnJoin.addEventListener('click', () => this.showModal(this.joinModal));

    // Create modal
    this.createModalClose.addEventListener('click', () => this.hideModal(this.createModal));
    this.btnCreateConfirm.addEventListener('click', () => this.createRoom());
    this.roomNameInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.createRoom();
    });

    // Join modal
    this.joinModalClose.addEventListener('click', () => this.hideModal(this.joinModal));
    this.btnJoinConfirm.addEventListener('click', () => this.joinRoom());
    this.roomIdInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') this.joinRoom();
    });
    this.roomIdInput.addEventListener('input', () => {
      this.joinError.textContent = '';
    });

    // Modal backdrop click
    this.createModal.addEventListener('click', (e) => {
      if (e.target === this.createModal) this.hideModal(this.createModal);
    });
    this.joinModal.addEventListener('click', (e) => {
      if (e.target === this.joinModal) this.hideModal(this.joinModal);
    });

    // Room actions
    this.btnCopyId.addEventListener('click', () => this.copyRoomId());
    this.btnLeave.addEventListener('click', () => this.leaveRoom());
    this.btnSend.addEventListener('click', () => this.sendPaste());
    this.pasteInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.sendPaste();
      }
    });

    // Handle page unload
    window.addEventListener('beforeunload', () => {
      if (this.ws) {
        this.ws.close();
      }
    });

    // Handle back/forward navigation
    window.addEventListener('popstate', (e) => {
      if (e.state && e.state.roomId) {
        this.joinRoomById(e.state.roomId);
      } else {
        this.showLandingPage();
      }
    });
  }

  checkUrlForRoomId() {
    const urlParams = new URLSearchParams(window.location.search);
    const roomId = urlParams.get('room');
    if (roomId) {
      this.joinRoomById(roomId);
    }
  }

  showModal(modal) {
    modal.classList.add('active');
    const input = modal.querySelector('input');
    if (input) {
      input.focus();
    }
  }

  hideModal(modal) {
    modal.classList.remove('active');
    const input = modal.querySelector('input');
    if (input) {
      input.value = '';
    }
    this.joinError.textContent = '';
  }

  showToast(message, type = 'info') {
    this.toast.textContent = message;
    this.toast.className = `toast active ${type}`;
    setTimeout(() => {
      this.toast.classList.remove('active');
    }, 3000);
  }

  // WebSocket Connection
  connect() {
    return new Promise((resolve, reject) => {
      if (this.isConnecting) {
        reject(new Error('Already connecting'));
        return;
      }
      
      this.isConnecting = true;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${protocol}//${window.location.host}`;
      
      // Set a connection timeout for cold starts
      const connectionTimeout = setTimeout(() => {
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
          this.ws.close();
          this.isConnecting = false;
          reject(new Error('Connection timeout'));
        }
      }, 30000); // 30 second timeout for cold starts
      
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        clearTimeout(connectionTimeout);
        console.log('WebSocket connected');
        this.isConnecting = false;
        this.reconnectAttempts = 0;
        this.hideConnectionStatus();
        resolve();
      };

      this.ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        this.handleMessage(message);
      };

      this.ws.onclose = () => {
        console.log('WebSocket disconnected');
        if (this.roomId && this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect();
        }
      };

      this.ws.onerror = (error) => {
        clearTimeout(connectionTimeout);
        console.error('WebSocket error:', error);
        this.isConnecting = false;
        reject(error);
      };
    });
  }

  showConnectionStatus(message) {
    let statusEl = document.getElementById('connection-status');
    if (!statusEl) {
      statusEl = document.createElement('div');
      statusEl.id = 'connection-status';
      statusEl.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#ff9800;color:#000;padding:12px;text-align:center;z-index:9999;font-weight:500;';
      document.body.prepend(statusEl);
    }
    statusEl.textContent = message;
    statusEl.style.display = 'block';
  }

  hideConnectionStatus() {
    const statusEl = document.getElementById('connection-status');
    if (statusEl) {
      statusEl.style.display = 'none';
    }
  }

  attemptReconnect() {
    this.reconnectAttempts++;
    // Exponential backoff with max 10 seconds
    const delay = Math.min(this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1), 10000);
    
    this.showConnectionStatus(`⏳ Server is waking up... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} (retrying in ${Math.round(delay/1000)}s)`);
    
    setTimeout(async () => {
      this.showConnectionStatus(`🔄 Connecting to server... Attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
      try {
        await this.connect();
        // Rejoin the room
        this.send({
          type: 'join_room',
          roomId: this.roomId
        });
        this.showToast('Reconnected successfully!', 'success');
      } catch (e) {
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.attemptReconnect();
        } else {
          this.hideConnectionStatus();
          this.showToast('Failed to reconnect. Please refresh the page.', 'error');
        }
      }
    }, delay);
  }

  send(message) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  handleMessage(message) {
    switch (message.type) {
      case 'room_created':
        this.onRoomCreated(message);
        break;
      case 'room_joined':
        this.onRoomJoined(message);
        break;
      case 'user_joined':
        this.onUserJoined(message);
        break;
      case 'user_left':
        this.onUserLeft(message);
        break;
      case 'new_paste':
        this.onNewPaste(message.paste);
        break;
      case 'error':
        this.onError(message);
        break;
    }
  }

  // Room Actions
  async createRoom() {
    try {
      this.showConnectionStatus('🔄 Connecting to server... (this may take up to 30s if server is sleeping)');
      await this.connect();
      this.send({
        type: 'create_room',
        name: this.roomNameInput.value.trim()
      });
    } catch (e) {
      this.hideConnectionStatus();
      this.showToast('Failed to connect. The server might be waking up - please try again in a few seconds.', 'error');
    }
  }

  async joinRoom() {
    const roomId = this.roomIdInput.value.trim().toUpperCase();
    if (!roomId) {
      this.joinError.textContent = 'Please enter a Room ID';
      return;
    }
    
    await this.joinRoomById(roomId);
  }

  async joinRoomById(roomId) {
    try {
      this.showConnectionStatus('🔄 Connecting to server... (this may take up to 30s if server is sleeping)');
      await this.connect();
      this.send({
        type: 'join_room',
        roomId: roomId
      });
    } catch (e) {
      this.hideConnectionStatus();
      this.showToast('Failed to connect. The server might be waking up - please try again in a few seconds.', 'error');
    }
  }

  leaveRoom() {
    if (this.ws) {
      this.send({ type: 'leave_room' });
      this.ws.close();
    }
    this.roomId = null;
    this.roomName = null;
    this.currentUser = null;
    this.showLandingPage();
    window.history.pushState({}, '', '/');
  }

  sendPaste() {
    const content = this.pasteInput.value.trim();
    if (!content) return;

    this.send({
      type: 'paste',
      content: content
    });

    this.pasteInput.value = '';
  }

  async copyRoomId() {
    try {
      await navigator.clipboard.writeText(this.roomId);
      this.showToast('Room ID copied!', 'success');
    } catch (e) {
      this.showToast('Failed to copy', 'error');
    }
  }

  async copyPasteContent(pasteEl, content) {
    try {
      await navigator.clipboard.writeText(content);
      pasteEl.classList.add('copied');
      const hint = pasteEl.querySelector('.paste-copy-hint');
      if (hint) hint.textContent = '✓ Copied!';
      
      setTimeout(() => {
        pasteEl.classList.remove('copied');
        if (hint) hint.textContent = 'Click to copy';
      }, 2000);
    } catch (e) {
      this.showToast('Failed to copy', 'error');
    }
  }

  // Event Handlers
  onRoomCreated(data) {
    this.hideModal(this.createModal);
    this.roomId = data.roomId;
    this.roomName = data.roomName;
    this.currentUser = data.user;
    
    this.showRoomPage();
    this.updateRoomInfo(data);
    this.clearPasteFeed();
    
    window.history.pushState({ roomId: this.roomId }, '', `?room=${this.roomId}`);
    this.showToast('Room created!', 'success');
  }

  onRoomJoined(data) {
    this.hideModal(this.joinModal);
    this.roomId = data.roomId;
    this.roomName = data.roomName;
    this.currentUser = data.user;
    
    this.showRoomPage();
    this.updateRoomInfo(data);
    this.clearPasteFeed();
    
    // Load existing pastes
    if (data.pastes && data.pastes.length > 0) {
      data.pastes.forEach(paste => this.addPasteToFeed(paste));
    }
    
    window.history.pushState({ roomId: this.roomId }, '', `?room=${this.roomId}`);
    this.showToast(`Joined as ${this.currentUser.userLabel}`, 'success');
  }

  onUserJoined(data) {
    this.updateUserCount(data.userCount);
    this.showToast(`${data.user.userLabel} joined`);
  }

  onUserLeft(data) {
    this.updateUserCount(data.userCount);
    this.showToast(`${data.user.userLabel} left`);
  }

  onNewPaste(paste) {
    this.addPasteToFeed(paste);
  }

  onError(data) {
    if (this.joinModal.classList.contains('active')) {
      this.joinError.textContent = data.message;
    } else {
      this.showToast(data.message, 'error');
    }
  }

  // UI Updates
  showLandingPage() {
    this.roomPage.classList.remove('active');
    this.landingPage.classList.add('active');
  }

  showRoomPage() {
    this.landingPage.classList.remove('active');
    this.roomPage.classList.add('active');
    this.pasteInput.focus();
  }

  updateRoomInfo(data) {
    this.roomNameDisplay.textContent = data.roomName;
    this.roomIdDisplay.textContent = data.roomId;
    this.userLabel.textContent = `You are ${this.currentUser.userLabel}`;
    this.updateUserCount(data.users.length);
  }

  updateUserCount(count) {
    this.userCount.textContent = `👤 ${count} user${count !== 1 ? 's' : ''}`;
  }

  clearPasteFeed() {
    // Remove all paste items but keep empty state
    const pasteItems = this.pasteFeed.querySelectorAll('.paste-item');
    pasteItems.forEach(item => item.remove());
    this.emptyState.style.display = 'flex';
  }

  addPasteToFeed(paste) {
    this.emptyState.style.display = 'none';

    const pasteEl = document.createElement('div');
    pasteEl.className = 'paste-item';
    pasteEl.dataset.pasteId = paste.id;

    const isSelf = paste.userLabel === this.currentUser?.userLabel;
    const time = new Date(paste.timestamp).toLocaleTimeString();

    pasteEl.innerHTML = `
      <div class="paste-header">
        <span class="paste-user ${isSelf ? 'self' : ''}">${paste.userLabel}${isSelf ? ' (You)' : ''}</span>
        <span class="paste-time">${time}</span>
      </div>
      <div class="paste-content">${this.escapeHtml(paste.content)}</div>
      <div class="paste-copy-hint">Click to copy</div>
    `;

    pasteEl.addEventListener('click', () => {
      this.copyPasteContent(pasteEl, paste.content);
    });

    this.pasteFeed.appendChild(pasteEl);
    this.pasteFeed.scrollTop = this.pasteFeed.scrollHeight;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  window.app = new ChipkuApp();
});
