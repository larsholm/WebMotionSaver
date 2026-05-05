/**
 * Main application controller.
 * Orchestrates camera, motion detection, recording, and UI.
 */
const App = (() => {
  // ─── State ───
  let stream = null;
  let mediaRecorder = null;
  let chunks = [];
  let isRecording = false;
  let motionTimeout = null;
  let motionActive = false;
  let lastClipId = null;
  let currentClipSize = 0;
  let recordingStartTime = 0;

  // ─── DOM refs ───
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  const video = $('#camera-feed');
  const overlay = $('#motion-overlay');
  const diffCanvas = $('#diff-canvas');
  const placeholder = $('#camera-placeholder');
  const statusEl = $('#camera-status');
  const indicator = $('#motion-indicator');
  const motionLabel = $('#motion-label');
  const motionBar = $('#motion-bar');
  const statusState = $('#status-state');
  const statusScore = $('#status-score');
  const statusRecording = $('#status-recording');
  const statusClipCount = $('#status-clip-count');
  const clipsGrid = $('#clips-grid');
  const noClipsMsg = $('#no-clips-msg');
  const clipCountBadge = $('#clip-count-badge');
  const btnStart = $('#btn-start');
  const btnStop = $('#btn-stop');
  const btnCapture = $('#btn-capture');

  // Modal elements
  const modal = $('#clip-modal');
  const modalVideo = $('#modal-video');
  const modalName = $('#modal-clip-name');
  const modalDuration = $('#modal-clip-duration');

  // ─── Initialize ───
  async function init() {
    // Open IndexedDB
    await ClipStore.open();

    // Load settings into UI
    Settings.load();
    applySettingsToUI();
    populateDeviceSelect();

    // Wire up events
    wireNavigation();
    wireCameraButtons();
    wireSettingsForm();
    wireModal();
    wireClipsActions();

    // Initial load
    updateClipCount();
    updateStorageDisplay();
    renderClips();

    // Sensitivity slider live preview
    $('#sensitivity-value').textContent = Settings.current.sensitivity + '%';
    $('#setting-sensitivity').addEventListener('input', (e) => {
      $('#sensitivity-value').textContent = e.target.value + '%';
    });

    console.log('WebMotion Saver initialized');
  }

  // ─── Navigation ───
  function wireNavigation() {
    $$('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        $$('.nav-btn').forEach(b => b.classList.remove('active'));
        $$('.tab-panel').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        $(`#tab-${tab}`).classList.add('active');

        if (tab === 'clips') {
          renderClips();
          updateStorageDisplay();
        }
      });
    });
  }

  // ─── Camera Controls ───
  function wireCameraButtons() {
    btnStart.addEventListener('click', startCamera);
    btnStop.addEventListener('click', stopCamera);
    btnCapture.addEventListener('click', captureSnapshot);
  }

  async function startCamera() {
    try {
      const constraints = Settings.getVideoConstraints();
      stream = await navigator.mediaDevices.getUserMedia(constraints);
      video.srcObject = stream;

      video.addEventListener('loadedmetadata', () => {
        placeholder.classList.add('hidden');
        statusEl.classList.remove('hidden');
        btnStart.classList.add('hidden');
        btnStop.classList.remove('hidden');
        btnCapture.classList.remove('hidden');

        // Initialize motion detector at 1/4 resolution for speed
        const detectW = Math.round(video.videoWidth / 4);
        const detectH = Math.round(video.videoHeight / 4);
        MotionDetector.init(overlay, detectW, detectH);
        MotionDetector.reset(video);
        statusState.textContent = 'Running';

        // Start motion analysis
        MotionDetector.start(video, Settings.current.sampleRate, handleMotionSample);

        console.log('Camera started:', video.videoWidth + 'x' + video.videoHeight);
      }, { once: true });

    } catch (err) {
      toast('Camera error: ' + err.message, 5000);
      console.error('Camera error:', err);
    }
  }

  function stopCamera() {
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    MotionDetector.stop();
    stopMotionGrace();

    video.srcObject = null;
    placeholder.classList.remove('hidden');
    statusEl.classList.add('hidden');
    btnStart.classList.remove('hidden');
    btnStop.classList.add('hidden');
    btnCapture.classList.add('hidden');
    statusState.textContent = 'Stopped';
    statusRecording.textContent = '—';
    indicator.className = 'indicator';
    motionLabel.textContent = 'Idle';
    motionBar.style.width = '0%';
    motionBar.classList.remove('motion');
    statusScore.textContent = '0%';

    currentClipSize = 0;
    isRecording = false;
    motionActive = false;

    console.log('Camera stopped');
  }

  // ─── Motion Detection ───
  function handleMotionSample({ score, diffData }) {
    const sensitivity = Settings.current.sensitivity;
    // Map sensitivity: at 50%, threshold is ~3% of pixels. At 100%, ~0.5%. At 1%, ~30%.
    const threshold = Math.max(0.5, (101 - sensitivity) * 0.3);

    // Update UI
    motionBar.style.width = score + '%';
    statusScore.textContent = score + '%';

    // Draw diff on overlay canvas
    if (diffData) {
      const ctx = overlay.getContext('2d');
      ctx.clearRect(0, 0, overlay.width, overlay.height);
      const overlayImg = ctx.createImageData(overlay.width, overlay.height);
      // Scale diff data to overlay size
      const scaleX = overlay.width / diffData.width;
      const scaleY = overlay.height / diffData.height;
      for (let y = 0; y < diffData.height; y++) {
        for (let x = 0; x < diffData.width; x++) {
          const srcIdx = (y * diffData.width + x) * 4;
          const dx = Math.round(x * scaleX);
          const dy = Math.round(y * scaleY);
          const dstIdx = (dy * overlay.width + dx) * 4;
          overlayImg.data[dstIdx] = diffData.data[srcIdx];
          overlayImg.data[dstIdx + 1] = diffData.data[srcIdx + 1];
          overlayImg.data[dstIdx + 2] = diffData.data[srcIdx + 2];
          overlayImg.data[dstIdx + 3] = diffData.data[srcIdx + 3];
        }
      }
      ctx.putImageData(overlayImg, 0, 0);

      // Also update diff preview
      const diffCtx = diffCanvas.getContext('2d');
      diffCtx.putImageData(diffData, 0, 0);
    }

    // Determine motion state
    const isMotion = score >= threshold;

    if (isMotion && !motionActive) {
      // Motion just started
      motionActive = true;
      indicator.className = 'indicator motion';
      motionLabel.textContent = 'Motion!';
      motionBar.classList.add('motion');
      startRecordingIfNot();
      console.log('Motion detected:', score + '%');
    } else if (isMotion) {
      // Motion ongoing — reset grace timer
      indicator.className = 'indicator motion';
      motionLabel.textContent = 'Motion!';
      resetMotionGrace();
    } else if (!isMotion && motionActive) {
      // Motion just stopped
      indicator.className = 'indicator';
      motionLabel.textContent = 'Last seen';
      motionBar.classList.remove('motion');
      startMotionGrace();
    } else {
      // No motion
      indicator.className = 'indicator';
      motionLabel.textContent = 'Idle';
      motionBar.classList.remove('motion');
    }
  }

  function startMotionGrace() {
    stopMotionGrace();
    motionTimeout = setTimeout(() => {
      motionActive = false;
      stopRecordingIfMotionStopped();
    }, Settings.current.gracePeriod * 1000);
  }

  function resetMotionGrace() {
    stopMotionGrace();
    motionTimeout = setTimeout(() => {
      motionActive = false;
      stopRecordingIfMotionStopped();
    }, Settings.current.gracePeriod * 1000);
  }

  function stopMotionGrace() {
    if (motionTimeout) {
      clearTimeout(motionTimeout);
      motionTimeout = null;
    }
  }

  // ─── Recording ───
  function startRecordingIfNot() {
    if (isRecording || !stream) return;

    try {
      const mimeType = Settings.getMimeType();
      const bitrate = Settings.getBitrate();

      chunks = [];
      currentClipSize = 0;

      mediaRecorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: bitrate
      });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunks.push(e.data);
          currentClipSize += e.data.size;
        }
      };

      mediaRecorder.onstop = async () => {
        const elapsed = (Date.now() - recordingStartTime) / 1000;
        const totalSize = chunks.reduce((s, c) => s + c.size, 0);

        if (totalSize > 0) {
          const blob = new Blob(chunks, { type: mimeType });
          const ext = Settings.getExtensions();
          const ts = new Date().toISOString().replace(/[:.]/g, '-');
          const name = 'motion-' + ts + ext;

          const clip = {
            id: crypto.randomUUID(),
            name,
            timestamp: Date.now(),
            duration: elapsed,
            size: blob.size,
            format: ext,
            blob: blob
          };

          await ClipStore.add(clip);
          lastClipId = clip.id;

          // Enforce max clips
          const count = await ClipStore.count();
          if (count > Settings.current.maxClips) {
            await enforceMaxClips();
          }

          updateClipCount();
          toast('Clip saved: ' + name, 3000);
          console.log('Clip saved:', name, formatBytes(blob.size));
        }

        isRecording = false;
        chunks = [];
        mediaRecorder = null;
        statusRecording.textContent = '—';
      };

      recordingStartTime = Date.now();
      mediaRecorder.start(1000); // Collect data every second
      isRecording = true;
      statusRecording.textContent = '● Recording';
      indicator.className = motionActive ? 'indicator motion recording' : 'indicator recording';

      console.log('Recording started:', mimeType, 'bitrate:', bitrate);
    } catch (err) {
      console.error('Recording error:', err);
      toast('Recording failed: ' + err.message, 4000);
      isRecording = false;
      statusRecording.textContent = '—';
    }
  }

  function stopRecordingIfMotionStopped() {
    if (mediaRecorder && mediaRecorder.state === 'recording') {
      const elapsed = (Date.now() - recordingStartTime) / 1000;

      if (elapsed >= Settings.current.minDuration) {
        mediaRecorder.stop(); // onstop will save the clip
      } else {
        // Too short — stop and discard
        mediaRecorder.ondataavailable = null;
        mediaRecorder.onstop = function () {
          isRecording = false;
          chunks = [];
          mediaRecorder = null;
          statusRecording.textContent = '—';
        };
        mediaRecorder.stop();
        toast('Short clip discarded (< ' + Settings.current.minDuration + 's)', 2000);
      }
    }
  }

  async function enforceMaxClips() {
    const clips = await ClipStore.list();
    if (clips.length > Settings.current.maxClips) {
      const toDelete = clips.slice(Settings.current.maxClips);
      for (const clip of toDelete) {
        await ClipStore.remove(clip.id);
      }
      toast('Removed ' + toDelete.length + ' old clips', 2000);
    }
  }

  function captureSnapshot() {
    if (!video.videoWidth) return;
    const snapCanvas = document.createElement('canvas');
    snapCanvas.width = video.videoWidth;
    snapCanvas.height = video.videoHeight;
    snapCanvas.getContext('2d').drawImage(video, 0, 0);

    const name = 'snapshot-' + new Date().toISOString().replace(/[:.]/g, '-') + '.png';
    snapCanvas.toBlob(function (blob) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
      toast('Snapshot saved', 2000);
    }, 'image/png');
  }

  // ─── Clips UI ───
  function wireClipsActions() {
    $('#btn-download-all').addEventListener('click', downloadAllClips);
    $('#btn-delete-all').addEventListener('click', async function () {
      if (confirm('Delete all clips? This cannot be undone.')) {
        await ClipStore.clearAll();
        updateClipCount();
        renderClips();
        updateStorageDisplay();
        toast('All clips deleted', 2000);
      }
    });
  }

  async function renderClips() {
    const clips = await ClipStore.list();
    const count = clips.length;
    updateClipCount();

    // Update action buttons
    const hasClips = count > 0;
    $('#btn-download-all').disabled = !hasClips;
    $('#btn-delete-all').disabled = !hasClips;

    if (!hasClips) {
      clipsGrid.innerHTML = '';
      clipsGrid.appendChild(noClipsMsg);
      noClipsMsg.style.display = '';
      return;
    }

    noClipsMsg.style.display = 'none';
    clipsGrid.innerHTML = '';

    for (const clip of clips) {
      const card = document.createElement('div');
      card.className = 'clip-card';
      card.innerHTML =
        '<div class="clip-thumb" data-id="' + clip.id + '">' +
          '<video src="" muted></video>' +
        '</div>' +
        '<div class="clip-info">' +
          '<div class="clip-meta">' +
            '<div>' + formatDate(clip.timestamp) + '</div>' +
            '<div>' + formatBytes(clip.size) + ' · ' + clip.format + '</div>' +
          '</div>' +
          '<div class="clip-actions">' +
            '<button class="btn btn-small" data-action="download" data-id="' + clip.id + '">⬇</button>' +
            '<button class="btn btn-small btn-danger" data-action="delete" data-id="' + clip.id + '">🗑</button>' +
          '</div>' +
        '</div>';
      clipsGrid.appendChild(card);

      // Generate thumbnail from blob
      var thumbVideo = card.querySelector('.clip-thumb video');
      var blob = await ClipStore.getBlob(clip.id);
      if (blob) {
        thumbVideo.src = URL.createObjectURL(blob);
        thumbVideo.addEventListener('loadeddata', function () {
          thumbVideo.currentTime = 0.5;
        }, { once: true });
      }

      // Click to open modal
      card.querySelector('.clip-thumb').addEventListener('click', (function (id) {
        return function () { openClipModal(id); };
      })(clip.id));
      card.querySelector('[data-action="download"]').addEventListener('click', (function (id) {
        return function () { downloadClip(id); };
      })(clip.id));
      card.querySelector('[data-action="delete"]').addEventListener('click', (function (id) {
        return function () { deleteClip(id); };
      })(clip.id));
    }
  }

  // ─── Clip Modal ───
  function wireModal() {
    $('#modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', function (e) {
      if (e.target === modal) closeModal();
    });
    $('#modal-download').addEventListener('click', function () {
      var id = modalVideo.dataset.clipId;
      if (id) downloadClip(id);
    });
    $('#modal-delete').addEventListener('click', function () {
      var id = modalVideo.dataset.clipId;
      if (id) {
        closeModal();
        deleteClip(id);
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !modal.classList.contains('hidden')) closeModal();
    });
  }

  async function openClipModal(id) {
    var clip = await ClipStore.get(id);
    if (!clip) return;

    var blob = await ClipStore.getBlob(id);
    if (!blob) return;

    modalName.textContent = clip.name;
    modalDuration.textContent = formatBytes(clip.size) + ' · ' + new Date(clip.timestamp).toLocaleString();

    if (modalVideo.src) URL.revokeObjectURL(modalVideo.src);
    modalVideo.src = URL.createObjectURL(blob);
    modalVideo.dataset.clipId = id;
    modal.classList.remove('hidden');
  }

  function closeModal() {
    if (modalVideo.src) URL.revokeObjectURL(modalVideo.src);
    modalVideo.src = '';
    modalVideo.dataset.clipId = '';
    modal.classList.add('hidden');
  }

  async function downloadClip(id) {
    var clip = await ClipStore.get(id);
    if (!clip) return;
    var blob = await ClipStore.getBlob(id);
    if (!blob) return;

    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = clip.name;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Downloading: ' + clip.name, 2000);
  }

  async function downloadAllClips() {
    var clips = await ClipStore.list();
    toast('Downloading ' + clips.length + ' clips...', 3000);
    for (var i = 0; i < clips.length; i++) {
      await downloadClip(clips[i].id);
      await new Promise(function (r) { setTimeout(r, 500); });
    }
  }

  async function deleteClip(id) {
    if (!confirm('Delete this clip?')) return;
    await ClipStore.remove(id);
    updateClipCount();
    renderClips();
    updateStorageDisplay();
    toast('Clip deleted', 2000);
  }

  // ─── Settings UI ───
  function wireSettingsForm() {
    $('#settings-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var s = {
        resolution: $('#setting-resolution').value,
        deviceId: $('#setting-device').value,
        sensitivity: parseInt($('#setting-sensitivity').value),
        sampleRate: parseInt($('#setting-sample-rate').value),
        gracePeriod: parseInt($('#setting-grace-period').value),
        minDuration: parseInt($('#setting-min-duration').value),
        quality: $('#setting-quality').value,
        format: $('#setting-format').value,
        maxClips: parseInt($('#setting-max-clips').value)
      };
      Settings.update(s);
      toast('Settings saved', 2000);
      updateStorageDisplay();
    });

    $('#btn-reset-settings').addEventListener('click', function () {
      Settings.reset();
      applySettingsToUI();
      toast('Settings reset to defaults', 2000);
    });
  }

  function applySettingsToUI() {
    $('#setting-resolution').value = Settings.current.resolution;
    $('#setting-device').value = Settings.current.deviceId;
    $('#setting-sensitivity').value = Settings.current.sensitivity;
    $('#sensitivity-value').textContent = Settings.current.sensitivity + '%';
    $('#setting-sample-rate').value = Settings.current.sampleRate;
    $('#setting-grace-period').value = Settings.current.gracePeriod;
    $('#setting-min-duration').value = Settings.current.minDuration;
    $('#setting-quality').value = Settings.current.quality;
    $('#setting-format').value = Settings.current.format;
    $('#setting-max-clips').value = Settings.current.maxClips;
  }

  async function populateDeviceSelect() {
    var select = $('#setting-device');
    try {
      var tmpStream = await navigator.mediaDevices.getUserMedia({ video: true });
      tmpStream.getTracks().forEach(function (t) { t.stop(); });

      var devices = await Settings.enumerateDevices();
      select.innerHTML = '<option value="">Auto-select</option>';
      devices.forEach(function (d) {
        var opt = document.createElement('option');
        opt.value = d.deviceId;
        opt.textContent = d.label || 'Camera ' + d.deviceId.slice(0, 8) + '...';
        if (d.deviceId === Settings.current.deviceId) opt.selected = true;
        select.appendChild(opt);
      });
    } catch (e) {
      // Permission denied — keep auto-select only
    }
  }

  // ─── Helpers ───
  function updateClipCount() {
    ClipStore.count().then(function (count) {
      statusClipCount.textContent = count;
      clipCountBadge.textContent = count;
      clipCountBadge.classList.toggle('visible', count > 0);
    });
  }

  async function updateStorageDisplay() {
    var total = await ClipStore.totalSize();
    var el = $('#storage-used');
    if (el) el.textContent = formatBytes(total);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    var k = 1024;
    var sizes = ['B', 'KB', 'MB', 'GB'];
    var i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  function formatDate(ts) {
    var d = new Date(ts);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  var toastTimer = null;
  function toast(msg, duration) {
    duration = duration || 3000;
    var el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.add('hidden'); }, duration);
  }

  // ─── Public API ───
  return { init: init };
})();

// Bootstrap
document.addEventListener('DOMContentLoaded', App.init);
