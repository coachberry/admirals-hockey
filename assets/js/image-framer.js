// Image Framer - drag and zoom to position image in a square frame

export function initFramer(inputId, previewId, onCropped) {
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = e => showFramer(e.target.result, preview, onCropped, input);
    reader.readAsDataURL(file);
  });
}

function showFramer(src, container, onCropped, input) {
  container.innerHTML = `
    <div class="framer-wrap">
      <p class="framer-instructions">Drag to reposition · Scroll or slider to zoom</p>
      <div class="framer-viewport" id="framerViewport">
        <img id="framerImg" src="${src}" draggable="false">
      </div>
      <div class="framer-controls">
        <input type="range" id="framerZoom" min="0.5" max="3" step="0.01" value="1">
        <label>Zoom</label>
      </div>
      <button type="button" id="framerConfirm" class="btn-primary">✓ Use This Photo</button>
    </div>
  `;

  const viewport = document.getElementById('framerViewport');
  const img = document.getElementById('framerImg');
  const zoomSlider = document.getElementById('framerZoom');
  const confirmBtn = document.getElementById('framerConfirm');

  let scale = 1, offsetX = 0, offsetY = 0, isDragging = false, startX, startY;

  function updateTransform() {
    img.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  }

  viewport.addEventListener('mousedown', e => { isDragging = true; startX = e.clientX - offsetX; startY = e.clientY - offsetY; viewport.style.cursor = 'grabbing'; });
  window.addEventListener('mousemove', e => { if (!isDragging) return; offsetX = e.clientX - startX; offsetY = e.clientY - startY; updateTransform(); });
  window.addEventListener('mouseup', () => { isDragging = false; viewport.style.cursor = 'grab'; });
  viewport.addEventListener('touchstart', e => { isDragging = true; startX = e.touches[0].clientX - offsetX; startY = e.touches[0].clientY - offsetY; });
  window.addEventListener('touchmove', e => { if (!isDragging) return; offsetX = e.touches[0].clientX - startX; offsetY = e.touches[0].clientY - startY; updateTransform(); });
  window.addEventListener('touchend', () => { isDragging = false; });
  zoomSlider.addEventListener('input', () => { scale = parseFloat(zoomSlider.value); updateTransform(); });
  viewport.addEventListener('wheel', e => { e.preventDefault(); scale = Math.min(3, Math.max(0.5, scale - e.deltaY * 0.001)); zoomSlider.value = scale; updateTransform(); });

  updateTransform();

  confirmBtn.addEventListener('click', () => {
    const size = 400;
    const canvas = document.createElement('canvas');
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext('2d');
    const vRect = viewport.getBoundingClientRect();
    const iRect = img.getBoundingClientRect();
    const scaleX = img.naturalWidth / iRect.width;
    const scaleY = img.naturalHeight / iRect.height;
    const sx = (vRect.left - iRect.left) * scaleX;
    const sy = (vRect.top - iRect.top) * scaleY;
    const sw = vRect.width * scaleX;
    const sh = vRect.height * scaleY;
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, size, size);
    const croppedDataURL = canvas.toDataURL('image/jpeg', 0.9);
    showConfirmed(croppedDataURL, src, container, onCropped, input);
  });
}

function showConfirmed(croppedDataURL, originalSrc, container, onCropped, input) {
  container.innerHTML = `
    <div style="display: flex; align-items: center; gap: 1rem; margin-top: 0.5rem;">
      <img src="${croppedDataURL}" style="width:80px; height:80px; border-radius:50%; object-fit:cover; border:3px solid #5e1825; flex-shrink:0;">
      <div style="display: flex; flex-direction: column; gap: 0.5rem;">
        <button type="button" id="reframeBtn" class="btn-secondary" style="font-size:0.8rem; padding: 6px 12px;">Re-frame</button>
        <button type="button" id="removePhotoBtn" class="btn-delete" style="font-size:0.8rem; padding: 6px 12px;">Remove Photo</button>
      </div>
    </div>
  `;

  onCropped(croppedDataURL);

  document.getElementById('reframeBtn').addEventListener('click', () => {
    showFramer(originalSrc, container, onCropped, input);
  });

  document.getElementById('removePhotoBtn').addEventListener('click', () => {
    input.value = '';
    container.innerHTML = '';
    onCropped(null);
  });
}
