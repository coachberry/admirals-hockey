// Image Framer - moveable crop rectangle over full image
// Card proportions: 7:8 ratio

export function showFramer(src, container, onCropped) {
  const RATIO = 7 / 8;

  container.innerHTML = `
    <div class="framer-wrap">
      <p class="framer-instructions">Drag the <strong>white box</strong> to choose crop area · Drag <strong>outside the box</strong> to pan image · Scroll to zoom</p>
      <div class="framer-stage" id="framerStage">
        <canvas id="framerCanvas"></canvas>
      </div>
      <div class="framer-controls">
        <span style="font-size:0.8rem;color:#666;">Zoom:</span>
        <button type="button" id="zoomOut" class="btn-secondary" style="padding:4px 12px;font-size:1rem;margin-bottom:0;">−</button>
        <button type="button" id="zoomIn" class="btn-secondary" style="padding:4px 12px;font-size:1rem;margin-bottom:0;">+</button>
      </div>
      <button type="button" id="framerConfirm" class="btn-primary">✓ Use This Photo</button>
    </div>
  `;

  const stage = document.getElementById('framerStage');
  const canvas = document.getElementById('framerCanvas');
  const ctx = canvas.getContext('2d');

  const img = new Image();
  img.onload = () => init();
  img.src = src;

  let imgScale = 1;
  let imgX = 0, imgY = 0;
  let cropX = 0, cropY = 0;
  let cropBoxW, cropBoxH;
  let stageW, stageH;

  function init() {
    stageW = stage.offsetWidth;
    stageH = Math.round(stageW * 0.8);
    stage.style.height = stageH + 'px';
    canvas.width = stageW;
    canvas.height = stageH;

    // Fit image to fill stage
    const fitW = stageW / img.naturalWidth;
    const fitH = stageH / img.naturalHeight;
    imgScale = Math.max(fitW, fitH);

    // Center image
    imgX = (stageW - img.naturalWidth * imgScale) / 2;
    imgY = (stageH - img.naturalHeight * imgScale) / 2;

    // Crop box: 65% of stage height, 7:8 ratio
    cropBoxH = Math.round(stageH * 0.75);
    cropBoxW = Math.round(cropBoxH * RATIO);

    // Center crop box
    cropX = (stageW - cropBoxW) / 2;
    cropY = (stageH - cropBoxH) / 2;

    draw();
    setupInteraction();
    setupZoom();
    setupConfirm();
  }

  function draw() {
    ctx.clearRect(0, 0, stageW, stageH);

    // Draw full image dimmed
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.drawImage(img, imgX, imgY, img.naturalWidth * imgScale, img.naturalHeight * imgScale);
    ctx.restore();

    // Draw crop area at full brightness - clip to crop box
    ctx.save();
    ctx.beginPath();
    ctx.rect(cropX, cropY, cropBoxW, cropBoxH);
    ctx.clip();
    ctx.drawImage(img, imgX, imgY, img.naturalWidth * imgScale, img.naturalHeight * imgScale);
    ctx.restore();

    // Crop box border
    ctx.save();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.strokeRect(cropX, cropY, cropBoxW, cropBoxH);
    ctx.restore();

    // Corner handles
    const handleSize = 10;
    ctx.fillStyle = 'white';
    [[cropX, cropY], [cropX + cropBoxW - handleSize, cropY],
     [cropX, cropY + cropBoxH - handleSize], [cropX + cropBoxW - handleSize, cropY + cropBoxH - handleSize]
    ].forEach(([x, y]) => ctx.fillRect(x, y, handleSize, handleSize));

    // Rule of thirds
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(cropX + (cropBoxW/3)*i, cropY); ctx.lineTo(cropX + (cropBoxW/3)*i, cropY+cropBoxH); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cropX, cropY + (cropBoxH/3)*i); ctx.lineTo(cropX+cropBoxW, cropY + (cropBoxH/3)*i); ctx.stroke();
    }
    ctx.restore();
  }

  function setupInteraction() {
    let dragging = null; // 'crop' or 'image'
    let startX, startY, startCropX, startCropY, startImgX, startImgY;

    function getPos(e) {
      const rect = stage.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function insideCrop(pos) {
      return pos.x >= cropX && pos.x <= cropX + cropBoxW && pos.y >= cropY && pos.y <= cropY + cropBoxH;
    }

    function onStart(e) {
      const pos = getPos(e);
      startX = pos.x; startY = pos.y;
      if (insideCrop(pos)) {
        dragging = 'crop';
        startCropX = cropX; startCropY = cropY;
      } else {
        dragging = 'image';
        startImgX = imgX; startImgY = imgY;
      }
      e.preventDefault();
    }

    function onMove(e) {
      if (!dragging) return;
      const pos = getPos(e);
      const dx = pos.x - startX;
      const dy = pos.y - startY;
      if (dragging === 'crop') {
        cropX = Math.max(0, Math.min(stageW - cropBoxW, startCropX + dx));
        cropY = Math.max(0, Math.min(stageH - cropBoxH, startCropY + dy));
      } else {
        imgX = startImgX + dx;
        imgY = startImgY + dy;
      }
      draw();
      e.preventDefault();
    }

    function onEnd() { dragging = null; }

    stage.addEventListener('mousedown', onStart);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onEnd);
    stage.addEventListener('touchstart', onStart, { passive: false });
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onEnd);
  }

  function setupZoom() {
    function zoom(delta) {
      // Zoom centered on crop box center
      const cx = cropX + cropBoxW / 2;
      const cy = cropY + cropBoxH / 2;
      const oldScale = imgScale;
      imgScale = Math.max(0.1, Math.min(10, imgScale * (1 + delta)));
      const factor = imgScale / oldScale;
      imgX = cx - (cx - imgX) * factor;
      imgY = cy - (cy - imgY) * factor;
      draw();
    }

    document.getElementById('zoomIn').addEventListener('click', () => zoom(0.15));
    document.getElementById('zoomOut').addEventListener('click', () => zoom(-0.15));
    stage.addEventListener('wheel', e => { e.preventDefault(); zoom(e.deltaY < 0 ? 0.08 : -0.08); }, { passive: false });
  }

  function setupConfirm() {
    document.getElementById('framerConfirm').addEventListener('click', () => {
      const outW = 400;
      const outH = Math.round(outW / RATIO);
      const output = document.createElement('canvas');
      output.width = outW;
      output.height = outH;
      const outCtx = output.getContext('2d');

      // Map crop box back to image source coordinates
      const srcX = (cropX - imgX) / imgScale;
      const srcY = (cropY - imgY) / imgScale;
      const srcW = cropBoxW / imgScale;
      const srcH = cropBoxH / imgScale;

      outCtx.drawImage(img, srcX, srcY, srcW, srcH, 0, 0, outW, outH);
      onCropped(output.toDataURL('image/jpeg', 0.92));
    });
  }
}
