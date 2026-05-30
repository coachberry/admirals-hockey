// ============================================
// EVENTS
// ============================================
let currentEventId = null;
let eventImageData = null;
let currentEventImageURL = null;

document.getElementById('addEventBtn').addEventListener('click', () => openEventModal());
document.getElementById('closeEventModal').addEventListener('click', () => document.getElementById('eventModal').classList.remove('active'));
document.getElementById('cancelEventBtn').addEventListener('click', () => document.getElementById('eventModal').classList.remove('active'));
document.getElementById('eventModal').addEventListener('click', e => { if (e.target === document.getElementById('eventModal')) document.getElementById('eventModal').classList.remove('active'); });

function openEventModal(data = null) {
  currentEventId = data?.id || null;
  eventImageData = null;
  currentEventImageURL = data?.imageURL || null;
  document.getElementById('eventId').value = data?.id || '';
  document.getElementById('eventName').value = data?.name || '';
  document.getElementById('eventDate').value = data?.date || '';
  document.getElementById('eventTime').value = data?.time || '';
  document.getElementById('eventEndTime').value = data?.endTime || '';
  document.getElementById('eventType').value = data?.type || '';
  document.getElementById('eventLocation').value = data?.location || '';
  document.getElementById('eventDetails').value = data?.details || '';
  document.getElementById('eventLink').value = data?.link || '';
  document.getElementById('eventSaveStatus').textContent = '';
  document.getElementById('eventModalTitle').textContent = data ? 'Edit Event' : 'Add Event';

  const preview = document.getElementById('eventImagePreview');
  if (currentEventImageURL) {
    preview.innerHTML = `<img src="${currentEventImageURL}" style="width:120px;aspect-ratio:16/9;object-fit:cover;border-radius:4px;border:1px solid #ddd;">`;
  } else {
    preview.innerHTML = '';
  }

  document.getElementById('eventModal').classList.add('active');
}

document.getElementById('eventImagePreview').addEventListener('click', () => document.getElementById('eventImage').click());
document.getElementById('eventImage').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    eventImageData = e.target.result;
    document.getElementById('eventImagePreview').innerHTML = `<img src="${eventImageData}" style="width:120px;aspect-ratio:16/9;object-fit:cover;border-radius:4px;border:1px solid #ddd;">`;
  };
  reader.readAsDataURL(file);
});

document.getElementById('saveEventBtn').addEventListener('click', async () => {
  const status = document.getElementById('eventSaveStatus');
  status.textContent = 'Saving...';
  const id = currentEventId || Date.now().toString();
  let imageURL = currentEventImageURL || '';
  if (eventImageData) {
    try {
      const storageRef = ref(storage, `events/${id}`);
      await uploadString(storageRef, eventImageData, 'data_url');
      imageURL = await getDownloadURL(storageRef);
    } catch(e) { console.error(e); }
  }
  await setDoc(doc(db, 'events', id), {
    id,
    name: document.getElementById('eventName').value,
    date: document.getElementById('eventDate').value,
    time: document.getElementById('eventTime').value,
    endTime: document.getElementById('eventEndTime').value,
    type: document.getElementById('eventType').value,
    location: document.getElementById('eventLocation').value,
    details: document.getElementById('eventDetails').value,
    link: document.getElementById('eventLink').value,
    imageURL
  });
  status.textContent = '✅ Saved!';
  status.style.color = 'green';
  setTimeout(() => { document.getElementById('eventModal').classList.remove('active'); loadEvents(); }, 800);
});

async function loadEvents() {
  const list = document.getElementById('eventsList');
  list.innerHTML = '';
  const snap = await getDocs(collection(db, 'events'));
  const events = [];
  snap.forEach(d => events.push(d.data()));
  if (!events.length) { list.innerHTML = '<div class="empty-state">No events added yet</div>'; return; }
  events.sort((a, b) => a.date.localeCompare(b.date)).forEach(e => {
    const item = document.createElement('div'); item.className = 'item';
    const dateStr = new Date(e.date + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    item.innerHTML = `
      <div class="item-info"><div>
        <strong>${e.name}</strong>
        <span>${dateStr}${e.type ? ' · ' + e.type : ''}${e.location ? ' · ' + e.location : ''}</span>
      </div></div>
      <div>
        <button class="btn-edit" onclick="editEvent('${e.id}')">Edit</button>
        <button class="btn-delete" onclick="deleteEvent('${e.id}')">Delete</button>
      </div>`;
    list.appendChild(item);
  });
}

window.editEvent = async (id) => {
  const snap = await getDoc(doc(db, 'events', id));
  if (snap.exists()) openEventModal(snap.data());
};
window.deleteEvent = async (id) => {
  if (!confirm('Delete this event?')) return;
  await deleteDoc(doc(db, 'events', id));
  try { await deleteObject(ref(storage, `events/${id}`)); } catch(e) {}
  loadEvents();
};

// ============================================
// QUICK HITS
// ============================================
document.getElementById('addQuickHitBtn').addEventListener('click', () => openQuickHitModal());
document.getElementById('closeQuickHitModal').addEventListener('click', () => document.getElementById('quickHitModal').classList.remove('active'));
document.getElementById('cancelQuickHitBtn').addEventListener('click', () => document.getElementById('quickHitModal').classList.remove('active'));

function openQuickHitModal(data = null) {
  document.getElementById('quickHitId').value = data?.id || '';
  document.getElementById('quickHitLabel').value = data?.label || '';
  document.getElementById('quickHitUrl').value = data?.url || '';
  document.getElementById('quickHitEmoji').value = data?.emoji || '';
  document.getElementById('quickHitOrder').value = data?.order || '';
  document.getElementById('quickHitModalTitle').textContent = data ? 'Edit Quick Hit' : 'Add Quick Hit';
  document.getElementById('quickHitModal').classList.add('active');
}

document.getElementById('saveQuickHitBtn').addEventListener('click', async () => {
  const id = document.getElementById('quickHitId').value || Date.now().toString();
  await setDoc(doc(db, 'quickhits', id), {
    id,
    label: document.getElementById('quickHitLabel').value,
    url: document.getElementById('quickHitUrl').value,
    emoji: document.getElementById('quickHitEmoji').value,
    order: parseInt(document.getElementById('quickHitOrder').value) || 99
  });
  document.getElementById('quickHitModal').classList.remove('active');
  loadQuickHits();
});

async function loadQuickHits() {
  const list = document.getElementById('quickHitsList');
  list.innerHTML = '';
  const snap = await getDocs(collection(db, 'quickhits'));
  const hits = [];
  snap.forEach(d => hits.push(d.data()));
  if (!hits.length) { list.innerHTML = '<div class="empty-state">No links added yet</div>'; return; }
  hits.sort((a, b) => (a.order||99) - (b.order||99)).forEach(h => {
    const item = document.createElement('div'); item.className = 'item';
    item.innerHTML = `
      <div class="item-info"><div>
        <strong>${h.emoji || ''} ${h.label}</strong>
        <span>${h.url}</span>
      </div></div>
      <div>
        <button class="btn-edit" onclick="editQuickHit('${h.id}')">Edit</button>
        <button class="btn-delete" onclick="deleteQuickHit('${h.id}')">Delete</button>
      </div>`;
    list.appendChild(item);
  });
}

window.editQuickHit = async (id) => {
  const snap = await getDoc(doc(db, 'quickhits', id));
  if (snap.exists()) openQuickHitModal(snap.data());
};
window.deleteQuickHit = async (id) => {
  if (!confirm('Delete this link?')) return;
  await deleteDoc(doc(db, 'quickhits', id));
  loadQuickHits();
};

// ============================================
// ALUMNI
// ============================================
async function loadAlumni() {
  const list = document.getElementById('alumniList');
  list.innerHTML = '';
  const snap = await getDocs(collection(db, 'alumni'));
  const alumni = [];
  snap.forEach(d => alumni.push({ id: d.id, ...d.data() }));
  alumni.sort((a, b) => (b.gradYear || 0) - (a.gradYear || 0));
  document.getElementById('alumniCount').textContent = `${alumni.length} signup${alumni.length !== 1 ? 's' : ''}`;
  if (!alumni.length) { list.innerHTML = '<div class="empty-state">No alumni signups yet</div>'; return; }
  alumni.forEach(a => {
    const item = document.createElement('div'); item.className = 'item';
    item.innerHTML = `
      <div class="item-info"><div>
        <strong>${a.name}</strong>
        <span>${a.email} · Class of ${a.gradYear || '?'}${a.position ? ' · ' + a.position : ''}</span>
      </div></div>
      <div>
        <button class="btn-delete" onclick="deleteAlumni('${a.id}')">Remove</button>
      </div>`;
    list.appendChild(item);
  });
}

window.deleteAlumni = async (id) => {
  if (!confirm('Remove this alumni signup?')) return;
  await deleteDoc(doc(db, 'alumni', id));
  loadAlumni();
};

document.getElementById('exportAlumniBtn').addEventListener('click', async () => {
  const snap = await getDocs(collection(db, 'alumni'));
  const rows = [['Name', 'Email', 'Grad Year', 'Position', 'Signed Up']];
  snap.forEach(d => {
    const a = d.data();
    rows.push([a.name, a.email, a.gradYear || '', a.position || '', a.signedUpAt || '']);
  });
  const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'admirals-alumni.csv'; a.click();
});

// ============================================
// NEWS - update save to include featured, homeCard, imageURL
// ============================================
let newsImageData = null;
let currentNewsImageURL = null;

document.getElementById('newsImageInput').addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    newsImageData = e.target.result;
    currentNewsImageURL = null;
    document.getElementById('newsImagePreview').innerHTML = `<img src="${newsImageData}" style="width:120px;aspect-ratio:16/9;object-fit:cover;border-radius:4px;border:1px solid #ddd;display:block;">`;
    document.getElementById('removeNewsImage').style.display = 'inline-block';
  };
  reader.readAsDataURL(file);
});

document.getElementById('removeNewsImage').addEventListener('click', () => {
  newsImageData = null;
  currentNewsImageURL = null;
  document.getElementById('newsImagePreview').innerHTML = '';
  document.getElementById('removeNewsImage').style.display = 'none';
});

// Load everything on startup
loadEvents();
loadQuickHits();
loadAlumni();
