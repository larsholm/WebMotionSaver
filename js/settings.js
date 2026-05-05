/**
 * Settings management with localStorage persistence.
 */
const Settings = (() => {
  const STORAGE_KEY = 'wms_settings';

  const defaults = {
    resolution: '1280x720',
    deviceId: '',
    sensitivity: 50,
    sampleRate: 500,       // ms between frames
    gracePeriod: 5,        // seconds after last motion
    minDuration: 2,        // minimum clip seconds
    quality: 'medium',
    format: 'webm',
    maxClips: 100
  };

  let current = { ...defaults };

  function load() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        current = { ...defaults, ...JSON.parse(saved) };
      }
    } catch (e) {
      console.warn('Failed to load settings:', e);
    }
    return current;
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch (e) {
      console.warn('Failed to save settings:', e);
    }
  }

  function update(partial) {
    current = { ...current, ...partial };
    save();
    return current;
  }

  function reset() {
    current = { ...defaults };
    localStorage.removeItem(STORAGE_KEY);
    return current;
  }

  function getVideoConstraints() {
    const [width, height] = current.resolution.split('x').map(Number);
    const constraints = {
      video: {
        width: { ideal: width },
        height: { ideal: height },
        frameRate: { ideal: 30 }
      },
      audio: false
    };
    if (current.deviceId) {
      constraints.video.deviceId = { exact: current.deviceId };
    }
    return constraints;
  }

  function getMimeType() {
    // When audio is not included in the stream, use video-only codecs
    // VP8 has the broadest support for video-only MediaRecorder
    const formats = {
      webm: [
        'video/webm;codecs=vp8',
        'video/webm;codecs=vp9',
        'video/webm'
      ],
      mp4: [
        'video/mp4;codecs=avc1.42E01E',
        'video/mp4;codecs=avc1',
        'video/mp4'
      ]
    };
    const list = formats[current.format] || formats.webm;
    for (const mime of list) {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
    // Fallback
    return 'video/webm';
  }

  function getBitrate() {
    const map = { low: 500000, medium: 1500000, high: 4000000 };
    return map[current.quality] || map.medium;
  }

  function getExtensions() {
    return current.format === 'mp4' ? '.mp4' : '.webm';
  }

  // Enumerate available camera devices
  async function enumerateDevices() {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter(d => d.kind === 'videoinput');
  }

  return {
    defaults,
    get current() { return current; },
    load, save, update, reset,
    getVideoConstraints, getMimeType, getBitrate, getExtensions,
    enumerateDevices
  };
})();
