// Image Framer - moveable crop rectangle over full image
// Card proportions: 280w x 320h (7:8 ratio)

export function showFramer(src, container, onCropped) {
  const CROP_W = 280;
  const CROP_H = 320;
  const RATIO = CROP_W / CROP_H;

  container.innerHTML = `
    <div class="framer-wrap">
      <p class="framer-instructions">Move the box to select the crop area · Scroll to zoom image</p>
      <div class="framer-stage" id="framerStage">
        <canvas id="framerCanvas"></canvas>
        <div class="crop-box" id="cropBox">
          <div class="crop-corner tl"></div>
          <div class="crop-corner tr"></div>
          <div class="crop-corner bl"></div>
          <div class="crop-corner br"></div>
        </div>
      </div>
      <div class="framer-controls">
        <span style="font-size:0.8rem;color:#666;">Zoom image:</span>
        <button type="button" id="zoomOut" class="btn-secondary" style="padding:4px 10px;font-size:0.9rem;">−</button>
        <button type="button" id="zoomIn" class="btn-secondary" style="padding:4px 10px;font-size:0.9rem;">+</button>
      </div>
      <button type="button" id="framerConfirm" class="btn-primary">✓ Use This Photo</button>
    </div>
  `;

  const stage = document.getElementById('framerStage');
  const canvas = document.getElementById('framerCanvas');
  const ctx = canvas.getContext('2d');
  const cropBox = document.getElementById('cropBox');

  const img = new Image();
  img.onload = () => init(img);
  img.src = src;

  let imgScale = 1;
  let imgX = 0;
  let imgY = 0;
  let cropX = 0;
  let cropY = 0;
  let stageW, stageH, cropBoxW, cropBoxH;

  function init(img) {
    stageW = stage.offsetWidth;
    stageH = Math.round(stageW * 0.85);
    stage.style.height = stageH + 'px';
    canvas.width = stageW;
    canvas.height = stageH;

    // Scale image to fit stage initially
    const fitScale = Math.min(stageW / img.naturalWidth, stageH / img.naturalHeight);
    imgScale = fitScale;

    // Center image
    imgX = (stageW - img.naturalWidth * imgScale) / 2;
    imgY = (stageH - img.naturalHeight * imgScale) / 2;

    // Crop box size: fill ~60% of stage height, maintain ratio
    cropBoxH = Math.round(stageH * 0.7);
    cropBoxW = Math.round(cropBoxH * RATIO);

    // Center crop box
    cropX = (stageW - cropBoxW) / 2;
    cropY = (stageH - cropBoxH) / 2;

    positionCropBox();
    drawImage();
    setupCropDrag();
    setupZoom(img);
    setupConfirm(img);
  }

  function drawImage() {
    ctx.clearRect(0, 0, stageW, stageH);
    // Dim overlay
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillRect(0, 0, stageW, stageH);
    // Draw image
    ctx.save();
    ctx.globalCompositeOperation = 'destination-over';
    ctx.drawImage(img, imgX, imgY, img.naturalWidth * imgScale, img.naturalHeight * imgScale);
    ctx.restore();
    // Brighten area inside crop box
    ctx.save();
    ctx.clearRect(cropX, cropY, cropBoxW, cropBoxH);
    ctx.drawImage(img, imgX, imgY, img.naturalWidth * imgScale, img.naturalHeight * imgScale);
    // Draw crop border
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.strokeRect(cropX, cropY, cropBoxW, cropBoxH);
    // Rule of thirds lines
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(cropX + (cropBoxW / 3) * i, cropY); ctx.lineTo(cropX + (cropBoxW / 3) * i, cropY + cropBoxH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cropX, cropY + (cropBoxH / 3) * i); ctx.lineTo(cropX + cropBoxW, cropY + (cropBoxH / 3) * i); ctx.stroke();
    }
    ctx.restore();
  }

  function positionCropBox() {
    cropBox.style.left = cropX + 'px';
    cropBox.style.top = cropY + 'px';
    cropBox.style.width = cropBoxW + 'px';
    cropBox.style.height = cropBoxH + 'px';
  }

  function setupCropDrag() {
    let dragging = false;
    let startX, startY, startCropX, startCropY;

    function getPos(e) {
      const rect = stage.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function onStart(e) {
      const pos = getPos(e);
      if (pos.x >= cropX && pos.x <= cropX + cropBoxW && pos.y >= cropY && pos.y <= cropY + cropBoxH) {
        dragging = true;
        startX = pos.x; startY = pos.y;
        startCropX = cropX; startCropY = cropY;
        e.preventDefault();
      }
    }

    function onMove(e) {
      if (!dragging) return;
      const pos = getPos(e);
      cropX = Math.max(0, Math.min(stageW - cropBoxW, startCropX + (pos.x - startX)));
      cropY = Math.max(0, Math.min(stageH - cropBoxH, startCropY + (pos.y - startY)));
      positionCropBox();
      drawImage();
      e.preventDefault();
    }

    function onEnd() { dragging = false; }

    stage.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    stage.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }

  function setupZoom(img) {
    function zoom(delta) {
      const centerX = imgX + (img.naturalWidth * imgScale) / 2;
      const centerY = imgY + (img.naturalHeight * imgScale) / 2;
      imgScale = Math.max(0.1, Math.min(5, imgScale + delta));
      imgX = centerX - (img.naturalWidth * imgScale) / 2;
      imgY = centerY - (img.naturalHeight * imgScale) / 2;
      drawImage();
    }

    document.getElementById('zoomIn').addEventListener('click', () => zoom(0.1));
    document.getElementById('zoomOut').addEventListener('click', () => zoom(-0.1));

    stage.addEventListener('wheel', e => {
      e.preventDefault();
      zoom(e.deltaY < 0 ? 0.05 : -0.05);
    }, { passive: false });
  }

  function setupConfirm(img) {
    document.getElementById('framerConfirm').addEventListener('click', () => {
      // Crop: map crop box on screen back to image coordinates
      const outW = 400;
      const outH = Math.round(outW / RATIO);
      const output = document.createElement('canvas');
      output.width = outW;
      output.height = outH;
      const outCtx = output.getContext('2d');

      // Crop box position relative to image on screen
      const srcX = (cropX - imgX) / imgScale;
      const srcY = (cropY - imgY) / imgScale;
      const srcW = cropBoxW / imgScale;
      const srcH = cropBoxH / imgScale;

      outCtx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
      const dataURL = output.toDataURL('image/jpeg', 0.92);
      onCropped(dataURL);
    });
  }
}
