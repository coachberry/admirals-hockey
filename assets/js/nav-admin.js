import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

document.addEventListener('DOMContentLoaded', () => {

const firebaseConfig = {
  apiKey: "AIzaSyAleQHLvA75qr5a-bAuIZKCUyGiZ8jTJbE",
  authDomain: "admirals-hockey.firebaseapp.com",
  projectId: "admirals-hockey",
  storageBucket: "admirals-hockey.firebasestorage.app",
  messagingSenderId: "783358659334",
  appId: "1:783358659334:web:5daffd093adca386faec87"
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db = getFirestore(app);

const tab = document.getElementById('navigationTab');
if (!tab) return;

const PAGES = [
  { id: 'home',        label: 'Home',           href: '/index.html' },
  { id: 'schedule',    label: 'Schedule',       href: '/schedule' },
  { id: 'roster',      label: 'Roster',         href: '/roster' },
  { id: 'stats',       label: 'Stats',          href: '/stats' },
  { id: 'leaderboard', label: 'Leaderboard',    href: '/leaderboard' },
  { id: 'news',        label: 'News',           href: '/news' },
  { id: 'events',      label: 'Events',         href: '/events' },
  { id: 'gallery',     label: 'Gallery',        href: '/gallery' },
  { id: 'chat',        label: 'Team Chat',      href: '/chat' },
  { id: 'summer',      label: 'Summer Hockey',  href: '/summer-hockey' },
  { id: 'alumni',      label: 'Alumni',         href: '/alumni' },
  { id: 'sponsors',    label: 'Sponsors',       href: '/sponsors' },
  { id: 'tryouts',     label: 'Tryouts',        href: '/tryouts' },
  { id: 'contact',     label: 'Contact',        href: '/contact' },
];

let navItems = [];

function defaultItems() {
  return PAGES.map(p => ({ id: p.id, type: 'link', label: p.label, href: p.href }));
}

function usedHrefs() {
  const set = new Set();
  navItems.forEach(i => {
    if (i.type === 'link') set.add(i.href);
    (i.children || []).forEach(c => set.add(c.href));
  });
  return set;
}

function availablePages() {
  return PAGES;
}

function render() {
  const list = document.getElementById('navItemsList');
  list.innerHTML = '';

  if (!navItems.length) {
    list.innerHTML = '<div class="empty-state">No nav items - click "Reset to Default" to start from the current menu</div>';
  }

  navItems.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'item';
    div.style.flexDirection = 'column';
    div.style.alignItems = 'stretch';
    div.style.gap = '0.5rem';

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.flexWrap = 'wrap';
    header.style.gap = '0.5rem';

    const titleWrap = document.createElement('div');
    titleWrap.style.display = 'flex';
    titleWrap.style.alignItems = 'center';
    titleWrap.style.gap = '0.4rem';

    const icon = document.createElement('span');
    icon.textContent = item.type === 'category' ? '📁' : '🔗';
    titleWrap.appendChild(icon);

    const labelInput = document.createElement('input');
    labelInput.type = 'text';
    labelInput.value = item.label;
    labelInput.style.fontWeight = '700';
    labelInput.style.border = '1px solid #ddd';
    labelInput.style.borderRadius = '4px';
    labelInput.style.padding = '0.3rem 0.5rem';
    labelInput.style.fontSize = '0.95rem';
    labelInput.oninput = () => { item.label = labelInput.value; };
    titleWrap.appendChild(labelInput);

    if (item.type === 'category') {
      const tag = document.createElement('span');
      tag.textContent = '(category)';
      tag.style.color = '#999';
      tag.style.fontSize = '0.8rem';
      titleWrap.appendChild(tag);
    }

    header.appendChild(titleWrap);

    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.gap = '0.4rem';
    controls.style.alignItems = 'center';
    controls.style.flexWrap = 'wrap';

    const upBtn = document.createElement('button');
    upBtn.className = 'btn-edit';
    upBtn.textContent = '↑';
    upBtn.disabled = i === 0;
    upBtn.onclick = () => { [navItems[i - 1], navItems[i]] = [navItems[i], navItems[i - 1]]; render(); };

    const downBtn = document.createElement('button');
    downBtn.className = 'btn-edit';
    downBtn.textContent = '↓';
    downBtn.disabled = i === navItems.length - 1;
    downBtn.onclick = () => { [navItems[i + 1], navItems[i]] = [navItems[i], navItems[i + 1]]; render(); };

    controls.appendChild(upBtn);
    controls.appendChild(downBtn);

    if (item.type === 'link') {
      const cats = navItems.filter(it => it.type === 'category');
      if (cats.length) {
        const sel = document.createElement('select');
        sel.innerHTML = '<option value="">Move into category...</option>' +
          cats.map(c => `<option value="${c.id}">${c.label}</option>`).join('');
        sel.onchange = () => {
          if (!sel.value) return;
          const target = navItems.find(it => it.id === sel.value);
          target.children = target.children || [];
          target.children.push({ id: item.id, type: 'link', label: item.label, href: item.href });
          navItems.splice(i, 1);
          render();
        };
        controls.appendChild(sel);
      }
    }

    const delBtn = document.createElement('button');
    delBtn.className = 'btn-delete';
    delBtn.textContent = 'Delete';
    delBtn.onclick = () => {
      if (!confirm('Remove this item?')) return;
      navItems.splice(i, 1);
      render();
    };
    controls.appendChild(delBtn);

    header.appendChild(controls);
    div.appendChild(header);

    if (item.type === 'category') {
      const childWrap = document.createElement('div');
      childWrap.style.paddingLeft = '1.5rem';
      childWrap.style.display = 'flex';
      childWrap.style.flexDirection = 'column';
      childWrap.style.gap = '0.4rem';

      item.children = item.children || [];

      if (!item.children.length) {
        const empty = document.createElement('div');
        empty.style.color = '#999';
        empty.style.fontSize = '0.85rem';
        empty.style.fontStyle = 'italic';
        empty.textContent = 'No pages in this category yet (will not show on site until you add one)';
        childWrap.appendChild(empty);
      }

      item.children.forEach((child, ci) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.flexWrap = 'wrap';
        row.style.gap = '0.4rem';

        const childWrapLabel = document.createElement('div');
        childWrapLabel.style.display = 'flex';
        childWrapLabel.style.alignItems = 'center';
        childWrapLabel.style.gap = '0.4rem';

        const childIcon = document.createElement('span');
        childIcon.textContent = '🔗';
        childWrapLabel.appendChild(childIcon);

        const childLabelInput = document.createElement('input');
        childLabelInput.type = 'text';
        childLabelInput.value = child.label;
        childLabelInput.style.border = '1px solid #ddd';
        childLabelInput.style.borderRadius = '4px';
        childLabelInput.style.padding = '0.25rem 0.5rem';
        childLabelInput.style.fontSize = '0.9rem';
        childLabelInput.oninput = () => { child.label = childLabelInput.value; };
        childWrapLabel.appendChild(childLabelInput);

        row.appendChild(childWrapLabel);

        const rc = document.createElement('div');
        rc.style.display = 'flex';
        rc.style.gap = '0.4rem';
        rc.style.flexWrap = 'wrap';

        const cup = document.createElement('button');
        cup.className = 'btn-edit'; cup.textContent = '↑'; cup.disabled = ci === 0;
        cup.onclick = () => { [item.children[ci - 1], item.children[ci]] = [item.children[ci], item.children[ci - 1]]; render(); };

        const cdown = document.createElement('button');
        cdown.className = 'btn-edit'; cdown.textContent = '↓'; cdown.disabled = ci === item.children.length - 1;
        cdown.onclick = () => { [item.children[ci + 1], item.children[ci]] = [item.children[ci], item.children[ci + 1]]; render(); };

        const out = document.createElement('button');
        out.className = 'btn-edit'; out.textContent = 'Move to top level';
        out.onclick = () => {
          const c = item.children.splice(ci, 1)[0];
          navItems.push({ id: c.id, type: 'link', label: c.label, href: c.href });
          render();
        };

        const cdel = document.createElement('button');
        cdel.className = 'btn-delete'; cdel.textContent = 'Remove';
        cdel.onclick = () => { item.children.splice(ci, 1); render(); };

        rc.appendChild(cup); rc.appendChild(cdown); rc.appendChild(out); rc.appendChild(cdel);
        row.appendChild(rc);
        childWrap.appendChild(row);
      });

      const addTocat = document.createElement('button');
      addTocat.className = 'btn-secondary';
      addTocat.textContent = '+ Add Link to Category';
      addTocat.style.marginTop = '0.4rem';
      addTocat.style.fontSize = '0.8rem';
      addTocat.onclick = () => {
        const label = prompt('Link label:');
        if (!label || !label.trim()) return;
        const href = prompt('Link URL (e.g. "/roster"):');
        if (!href || !href.trim()) return;
        item.children = item.children || [];
        item.children.push({ id: 'custom-' + Date.now(), type: 'link', label: label.trim(), href: href.trim() });
        render();
      };
      childWrap.appendChild(addTocat);

      div.appendChild(childWrap);
    } else {
      // editable label for categories only is above; links use PAGES labels (not editable here)
    }

    list.appendChild(div);
  });

  // Top-level "add page" select
  const avail = availablePages();
  const addPageSelect = document.getElementById('navAddPageSelect');
  addPageSelect.innerHTML = '<option value="">+ Add page to top level...</option>' +
    avail.map(p => `<option value="${p.id}">${p.label}</option>`).join('');
}

async function loadNav() {
  const snap = await getDoc(doc(db, 'settings', 'navigation'));
  const data = snap.exists() ? snap.data() : null;
  navItems = (data && Array.isArray(data.items) && data.items.length) ? data.items : defaultItems();
  render();
}

document.getElementById('navAddPageSelect').addEventListener('change', e => {
  if (!e.target.value) return;
  const page = PAGES.find(p => p.id === e.target.value);
  navItems.push({ id: page.id, type: 'link', label: page.label, href: page.href });
  e.target.value = '';
  render();
});

document.getElementById('navAddCategoryBtn').addEventListener('click', () => {
  const label = prompt('Category name (e.g. "Team"):');
  if (!label || !label.trim()) return;
  navItems.push({ id: 'cat-' + Date.now(), type: 'category', label: label.trim(), href: null, children: [] });
  render();
});

document.getElementById('navResetBtn').addEventListener('click', () => {
  if (!confirm('Reset to the default flat navigation? This will discard unsaved changes.')) return;
  navItems = defaultItems();
  render();
});

document.getElementById('saveNavBtn').addEventListener('click', async () => {
  await setDoc(doc(db, 'settings', 'navigation'), { items: navItems, updatedAt: new Date().toISOString() });
  const status = document.getElementById('navSaveStatus');
  status.textContent = '✅ Saved! Refresh the site to see the updated menu.';
  setTimeout(() => { status.textContent = ''; }, 4000);
});

document.querySelector('[data-tab="navigation"]').addEventListener('click', loadNav);

loadNav();

});
