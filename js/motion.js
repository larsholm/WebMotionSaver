/**
 * Motion detection via frame differencing.
 * Compares consecutive video frames on a hidden canvas
 * and reports the percentage of changed pixels.
 */
const MotionDetector = (() => {
  let prevFrame = null;
  let canvas = null;
  let ctx = null;
  let width = 0;
  let height = 0;
  let sampleInterval = null;

  /**
   * Initialize the detector with a canvas element.
   * Uses a smaller canvas for faster comparison.
   */
  function init(canvasEl, w, h) {
    canvas = canvasEl;
    width = w || 160;
    height = h || 120;
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d', { willReadFrequently: true });
    prevFrame = null;
  }

  /**
   * Analyze a frame from the video element.
   * Returns { score: 0-100, diffData: ImageData }
   */
  function analyze(videoEl) {
    if (!ctx || !videoEl.videoWidth) return { score: 0, diffData: null };

    // Draw current frame to small canvas
    ctx.drawImage(videoEl, 0, 0, width, height);
    const currentData = ctx.getImageData(0, 0, width, height);

    if (!prevFrame) {
      prevFrame = new Uint8ClampedArray(currentData.data);
      return { score: 0, diffData: null };
    }

    let changedPixels = 0;
    const totalPixels = width * height;
    const diffData = ctx.createImageData(width, height);
    const threshold = 30; // per-channel difference threshold

    for (let i = 0; i < currentData.data.length; i += 4) {
      const rDiff = Math.abs(currentData.data[i] - prevFrame[i]);
      const gDiff = Math.abs(currentData.data[i + 1] - prevFrame[i + 1]);
      const bDiff = Math.abs(currentData.data[i + 2] - prevFrame[i + 2]);

      if (rDiff > threshold || gDiff > threshold || bDiff > threshold) {
        changedPixels++;
        // Highlight changed pixels in red
        diffData.data[i] = 255;
        diffData.data[i + 1] = 0;
        diffData.data[i + 2] = 0;
        diffData.data[i + 3] = 180;
      } else {
        diffData.data[i + 3] = 0; // transparent
      }
    }

    // Update previous frame
    prevFrame = new Uint8ClampedArray(currentData.data);

    const score = Math.round((changedPixels / totalPixels) * 100);
    return { score, diffData };
  }

  /**
   * Reset the reference frame (e.g., when starting fresh or after scene change).
   */
  function reset(videoEl) {
    if (ctx && videoEl.videoWidth) {
      ctx.drawImage(videoEl, 0, 0, width, height);
      const data = ctx.getImageData(0, 0, width, height);
      prevFrame = new Uint8ClampedArray(data.data);
    } else {
      prevFrame = null;
    }
  }

  /**
   * Start periodic analysis at the configured sample rate.
   */
  function start(videoEl, intervalMs, onSample) {
    stop();
    sampleInterval = setInterval(() => {
      const result = analyze(videoEl);
      if (onSample) onSample(result);
    }, intervalMs);
  }

  function stop() {
    if (sampleInterval) {
      clearInterval(sampleInterval);
      sampleInterval = null;
    }
  }

  return { init, analyze, reset, start, stop };
})();
