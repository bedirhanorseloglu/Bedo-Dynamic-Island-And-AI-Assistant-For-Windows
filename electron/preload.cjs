const { contextBridge, ipcRenderer, webUtils } = require('electron');

let lastCapturedDrop = { time: 0, paths: [] };
window.addEventListener(
  'drop',
  (e) => {
    const files = e.dataTransfer?.files;
    if (!files || !files.length || !webUtils?.getPathForFile) return;
    const paths = [];
    for (let i = 0; i < files.length; i++) {
      try {
        const p = webUtils.getPathForFile(files[i]);
        if (p) paths.push(p);
      } catch {}
    }
    if (paths.length) {
      lastCapturedDrop = { time: Date.now(), paths };
    }
  },
  true
);

contextBridge.exposeInMainWorld('twocode', {
  setIgnoreMouseEvents: (ignore) => ipcRenderer.send('set-ignore-mouse-events', ignore),
  setExpanded: (expanded) => ipcRenderer.send('set-expanded', expanded),
  setIslandMode: (mode, customWidth, customHeight, hasDroplet) => ipcRenderer.send('set-island-mode', mode, customWidth, customHeight, hasDroplet),
  onNotchHoverChange: (cb) => {
    const listener = (_event, hovering) => cb(hovering);
    ipcRenderer.on('notch-hover-change', listener);
    return () => ipcRenderer.removeListener('notch-hover-change', listener);
  },
  onGameModeChange: (cb) => {
    const listener = (_event, active) => cb(Boolean(active));
    ipcRenderer.on('game-mode-change', listener);
    return () => ipcRenderer.removeListener('game-mode-change', listener);
  },
  isGameModeActive: () => ipcRenderer.invoke('is-game-mode-active'),
  openSettingsWindow: (tab) => ipcRenderer.invoke('open-settings-window', tab),
  settingsWindowControl: (action) => ipcRenderer.send('settings-window-control', action),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  saveSettings: (settings) => ipcRenderer.invoke('save-settings', settings),
  onSettingsUpdated: (cb) => {
    const listener = (_event, data) => cb(data);
    ipcRenderer.on('settings-updated', listener);
    return () => ipcRenderer.removeListener('settings-updated', listener);
  },
  onNavigateSettingsTab: (cb) => {
    const listener = (_event, tab) => cb(tab);
    ipcRenderer.on('navigate-settings-tab', listener);
    return () => ipcRenderer.removeListener('navigate-settings-tab', listener);
  },
  pickProgramFile: () => ipcRenderer.invoke('pick-program-file'),
  getInstalledApps: (opts) => ipcRenderer.invoke('get-installed-apps', opts),
  triggerIslandEmotion: (emotion) => ipcRenderer.send('trigger-island-emotion', emotion),
  onIslandEmotion: (cb) => {
    const listener = (_event, emotion) => cb(emotion);
    ipcRenderer.on('island-emotion', listener);
    return () => ipcRenderer.removeListener('island-emotion', listener);
  },
  onIslandShortcutAction: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('island-shortcut-action', listener);
    return () => ipcRenderer.removeListener('island-shortcut-action', listener);
  },
  triggerTestNotification: (notif) => ipcRenderer.send('trigger-test-notification', notif),
  getAiHistory: () => ipcRenderer.invoke('get-ai-history'),
  getAgentIntegrationStatus: () => ipcRenderer.invoke('get-agent-integration-status'),
  connectAgentIntegrations: () => ipcRenderer.invoke('connect-agent-integrations'),
  testAgentIntegration: (agent) => ipcRenderer.invoke('test-agent-integration', agent),
  getGHelperBridgeStatus: () => ipcRenderer.invoke('get-ghelper-bridge-status'),
  installGHelperBridge: () => ipcRenderer.invoke('install-ghelper-bridge'),
  startGHelperBridge: () => ipcRenderer.invoke('start-ghelper-bridge'),
  testGHelperHud: (sampleText) => ipcRenderer.invoke('test-ghelper-hud', sampleText),
  getGHelperStatus: () => ipcRenderer.invoke('get-ghelper-status'),
  onGHelperStatusUpdate: (cb) => {
    const listener = (_event, data) => cb(data);
    ipcRenderer.on('ghelper-status-update', listener);
    return () => ipcRenderer.removeListener('ghelper-status-update', listener);
  },
  onAiHistoryUpdate: (cb) => {
    const listener = (_event, data) => cb(data);
    ipcRenderer.on('ai-history-update', listener);
    return () => ipcRenderer.removeListener('ai-history-update', listener);
  },
  mediaControl: (action, value) => ipcRenderer.invoke('media-control', action, value),
  openGHelper: () => ipcRenderer.invoke('open-ghelper'),
  launchMusicService: (service) => ipcRenderer.invoke('launch-music-service', service),
  getMediaStatus: () => ipcRenderer.invoke('get-media-status'),
  focusMediaSource: (media) => ipcRenderer.invoke('focus-media-source', media),
  onMediaUpdate: (cb) => {
    const listener = (_event, data) => cb(data);
    ipcRenderer.on('media-update', listener);
    return () => ipcRenderer.removeListener('media-update', listener);
  },
  onClipboardUpdate: (cb) => {
    const listener = (_event, list) => cb(list);
    ipcRenderer.on('clipboard-update', listener);
    return () => ipcRenderer.removeListener('clipboard-update', listener);
  },
  copyText: (text) => ipcRenderer.invoke('copy-text', text),
  copyClip: (clip) => ipcRenderer.invoke('copy-clip', clip),
  clearClips: () => ipcRenderer.invoke('clear-clips'),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file) || '';
    } catch {
      return file?.path || '';
    }
  },
  transcribeAudio: (payload) => ipcRenderer.invoke('transcribe-audio', payload),
  openNoteAttachment: (payload) => ipcRenderer.invoke('open-note-attachment', payload),
  copyNoteAttachment: (payload) => ipcRenderer.invoke('copy-note-attachment', payload),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  openApp: (target) => ipcRenderer.invoke('open-app', target),
  openNotificationTarget: (target) => ipcRenderer.invoke('open-notification-target', target),
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  getSystemStats: () => ipcRenderer.invoke('get-system-stats'),
  getPerfMetrics: () => ipcRenderer.invoke('get-perf-metrics'),
  getBatteryChargeEta: (opts) => ipcRenderer.invoke('get-battery-charge-eta', opts),
  openTaskMgrPerf: (section) => ipcRenderer.invoke('open-taskmgr-perf', section),
  focusAgentWindow: (payload) => ipcRenderer.invoke('focus-agent-window', payload),
  getDroppedFilePaths: (files) => {
    const direct = [];
    if (files && webUtils?.getPathForFile) {
      for (let i = 0; i < files.length; i++) {
        try {
          const p = webUtils.getPathForFile(files[i]);
          if (p) direct.push(p);
        } catch {}
      }
    }
    if (direct.length) return direct;
    if (Date.now() - lastCapturedDrop.time < 1000 && lastCapturedDrop.paths.length) {
      return lastCapturedDrop.paths;
    }
    return [];
  },
  getDropShelf: () => ipcRenderer.invoke('get-drop-shelf'),
  addDropFiles: (paths) => ipcRenderer.invoke('add-drop-files', paths),
  pickDropFiles: () => ipcRenderer.invoke('pick-drop-files'),
  removeDropFile: (id) => ipcRenderer.invoke('remove-drop-file', id),
  clearDropShelf: () => ipcRenderer.invoke('clear-drop-shelf'),
  getDropShareStatus: () => ipcRenderer.invoke('get-drop-share-status'),
  toggleDropShareServer: (enabled) => ipcRenderer.invoke('toggle-drop-share-server', enabled),
  openDropFile: (filePath) => ipcRenderer.invoke('open-drop-file', filePath),
  saveAllDropFiles: () => ipcRenderer.invoke('save-all-drop-files'),
  startDropDrag: (filePath) => ipcRenderer.sendSync('start-drop-drag', filePath),
  onDropShelfUpdate: (cb) => {
    const listener = (_event, files) => cb(files);
    ipcRenderer.on('drop-shelf-update', listener);
    return () => ipcRenderer.removeListener('drop-shelf-update', listener);
  },
  onAgentEvent: (cb) => {
    const listener = (_event, data) => cb(data);
    ipcRenderer.on('agent-event', listener);
    return () => ipcRenderer.removeListener('agent-event', listener);
  },
  resolveAgentApproval: (id, approved) => ipcRenderer.invoke('resolve-agent-approval', { id, approved }),
  simulateAgentTask: (type) => ipcRenderer.invoke('simulate-agent-task', type),
  adjustVolume: (direction) => ipcRenderer.invoke('adjust-volume', direction),
  setVolume: (percent) => ipcRenderer.invoke('set-volume', percent),
  getSystemMicMuted: () => ipcRenderer.invoke('get-system-mic-muted'),
  setSystemMicMuted: (muted) => ipcRenderer.invoke('set-system-mic-muted', muted),
  onSystemHud: (cb) => {
    const listener = (_event, data) => cb(data);
    ipcRenderer.on('system-hud', listener);
    return () => ipcRenderer.removeListener('system-hud', listener);
  },
  onWindowsNotification: (cb) => {
    const listener = (_event, notif) => cb(notif);
    ipcRenderer.on('windows-notification', listener);
    return () => ipcRenderer.removeListener('windows-notification', listener);
  },
  getNetworkInfo: () => ipcRenderer.invoke('get-network-info'),
  getRadioStates: () => ipcRenderer.invoke('get-radio-states'),
  toggleRadio: (kind) => ipcRenderer.invoke('toggle-radio', kind),
  scanWifiNetworks: () => ipcRenderer.invoke('scan-wifi-networks'),
  scanBluetoothDevices: () => ipcRenderer.invoke('scan-bluetooth-devices'),
  pairBluetoothDevice: (deviceId) => ipcRenderer.invoke('pair-bluetooth-device', deviceId),
  addAgendaEvent: (evt) => ipcRenderer.invoke('add-agenda-event', evt),
  getAgendaEvents: () => ipcRenderer.invoke('get-agenda-events'),
  deleteAgendaEvent: (eventId) => ipcRenderer.invoke('delete-agenda-event', eventId),
  toggleAgendaEvent: (eventId) => ipcRenderer.invoke('toggle-agenda-event', eventId),
  onAgendaEventsUpdate: (cb) => {
    const listener = (_event, agenda) => cb(agenda);
    ipcRenderer.on('local-agenda-update', listener);
    return () => ipcRenderer.removeListener('local-agenda-update', listener);
  },
  getFileIcon: (filePath) => ipcRenderer.invoke('get-file-icon', filePath),
  resolveAppLogo: (payload) => ipcRenderer.invoke('resolve-app-logo', payload),
  testMailNotif: () => ipcRenderer.invoke('test-mail-notif'),
  testAgendaNotif: () => ipcRenderer.invoke('test-agenda-notif'),
  connectGoogle: (opts) => ipcRenderer.invoke('connect-google', opts),
  disconnectGoogle: () => ipcRenderer.invoke('disconnect-google'),
  getGoogleData: () => ipcRenderer.invoke('get-google-data'),
  onGoogleDataUpdate: (cb) => {
    const listener = (_event, data) => cb(data);
    ipcRenderer.on('google-data-update', listener);
    return () => ipcRenderer.removeListener('google-data-update', listener);
  },
  askRobo: (payload) => ipcRenderer.invoke('ask-robo', payload),
  bedoStart: (opts) => ipcRenderer.invoke('bedo:start', opts),
  bedoStop: () => ipcRenderer.invoke('bedo:stop'),
  bedoGetStatus: () => ipcRenderer.invoke('bedo:status'),
  getPythonBootstrapStatus: () => ipcRenderer.invoke('get-python-bootstrap-status'),
  onPythonBootstrapStatus: (cb) => {
    const listener = (_event, status) => cb(status);
    ipcRenderer.on('python-bootstrap-status', listener);
    return () => ipcRenderer.removeListener('python-bootstrap-status', listener);
  },
  bedoSendText: (text) => ipcRenderer.invoke('bedo:send-text', text),
  bedoSetMuted: (muted) => ipcRenderer.invoke('bedo:set-muted', muted),
  bedoSetSpeakerVolume: (volume) => ipcRenderer.invoke('bedo:set-speaker-volume', volume),
  bedoSetSpeakerMuted: (muted) => ipcRenderer.invoke('bedo:set-speaker-muted', muted),
  bedoSetSystemMicMuted: (muted) => ipcRenderer.invoke('bedo:set-system-mic-muted', muted),
  bedoSetPaused: (paused) => ipcRenderer.invoke('bedo:set-paused', paused),
  bedoSetWebcam: (active) => ipcRenderer.invoke('bedo:set-webcam', active),
  bedoSyncIslandState: (state) => ipcRenderer.invoke('bedo:island-state', state),
  bedoPreviewVoice: (opts) => ipcRenderer.invoke('bedo:preview-voice', opts),
  startBedoBuddy: () => ipcRenderer.invoke('bedo-buddy:start'),
  askRoboVision: (payload) => ipcRenderer.invoke('ask-robo-vision', payload),
  onBedoBuddyCaptured: (cb) => {
    const listener = (_event, payload) => cb(payload);
    ipcRenderer.on('buddy-captured', listener);
    return () => ipcRenderer.removeListener('buddy-captured', listener);
  },
  onBedoEvent: (cb) => {
    const listener = (_event, msg) => cb(msg);
    ipcRenderer.on('bedo-event', listener);
    return () => ipcRenderer.removeListener('bedo-event', listener);
  },
  onBedoStatus: (cb) => {
    const listener = (_event, status) => cb(status);
    ipcRenderer.on('bedo-status', listener);
    return () => ipcRenderer.removeListener('bedo-status', listener);
  },
  onAppContext: (cb) => {
    const listener = (_event, data) => cb(data);
    ipcRenderer.on('app-context', listener);
    return () => ipcRenderer.removeListener('app-context', listener);
  },
  onLiveActivity: (cb) => {
    const listener = (_event, data) => cb(data);
    ipcRenderer.on('live-activity', listener);
    return () => ipcRenderer.removeListener('live-activity', listener);
  },
  getAppVersion: () => ipcRenderer.invoke('app:get-version'),
  validateApiKey: (payload) => ipcRenderer.invoke('validate-api-key', payload),
  checkForUpdates: () => ipcRenderer.invoke('app:check-for-updates'),
  installUpdate: () => ipcRenderer.invoke('app:install-update'),
  onUpdateStatus: (cb) => {
    const listener = (_event, status) => cb(status);
    ipcRenderer.on('update-status', listener);
    return () => ipcRenderer.removeListener('update-status', listener);
  },
  onIslandRevealed: (cb) => {
    const listener = () => cb();
    ipcRenderer.on('island-revealed', listener);
    return () => ipcRenderer.removeListener('island-revealed', listener);
  },
  quitApp: () => ipcRenderer.send('quit-app'),
});
