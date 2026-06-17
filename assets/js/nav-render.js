import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
const auth = getAuth(app);

function hrefToPageId(href) {
  if (!href) return null;
  const m = href.match(/\/([a-zA-Z0-9-]+)(?:\.html)?$/);
  return m ? m[1] : null;
}

async function init() {
  const ul = document.getElementById('navLinks');
  function reveal() {
    var s = document.getElementById('nav-hide-style');
    if (s) s.remove();
    // Don't touch ul.style.display - let CSS classes control visibility
  }

  let navSnap;
  try {
    navSnap = await getDoc(doc(db, 'settings', 'navigation'));
  } catch (e) { reveal(); return; }
  if (!navSnap.exists()) { reveal(); return; } // no custom nav configured - leave static menu as-is

  const items = navSnap.data().items;
  if (!Array.isArray(items) || !items.length) { reveal(); return; }

  if (!ul) return;

  let hiddenPages = {};
  try {
    const pagesSnap = await getDoc(doc(db, 'settings', 'pages'));
    if (pagesSnap.exists()) {
      const f = pagesSnap.data();
      Object.keys(f).forEach(k => { if (f[k] === false) hiddenPages[k] = true; });
    }
  } catch (e) {}

  const mobileAuthLi = document.getElementById('mobileAuthButtons');
  ul.querySelectorAll('li').forEach(li => { if (li.id !== 'mobileAuthButtons') li.remove(); });

  const fragment = document.createDocumentFragment();

  items.forEach(item => {
    if (item.type === 'category') {
      const children = (item.children || []).filter(c => {
        const pid = hrefToPageId(c.href);
        return !(pid && hiddenPages[pid]);
      });
      if (!children.length) return;
      const li = document.createElement('li');
      li.className = 'nav-dropdown';
      li.innerHTML = `<a href="#" class="nav-link nav-dropdown-toggle">${item.label} <span class="dropdown-arrow">▾</span></a>
        <ul class="dropdown-menu">${children.map(c => `<li><a href="${c.href}" class="nav-link">${c.label}</a></li>`).join('')}</ul>`;
      fragment.appendChild(li);
    } else {
      const pid = hrefToPageId(item.href);
      if (pid && hiddenPages[pid]) return;
      const li = document.createElement('li');
      li.innerHTML = `<a href="${item.href}" class="nav-link">${item.label}</a>`;
      fragment.appendChild(li);
    }
  });

  if (mobileAuthLi) {
    ul.insertBefore(fragment, mobileAuthLi);
  } else {
    ul.appendChild(fragment);
  }

  // Active link highlight
  const currentPage = window.location.pathname.split('/').pop() || '';
  ul.querySelectorAll('a[href]').forEach(a => {
    const href = a.getAttribute('href');
    const m = href.match(/\/([a-zA-Z0-9-]+)(?:\.html)?$/);
    const hrefSlug = m ? m[1] : '';
    if (hrefSlug === currentPage || (currentPage === '' && (href === '/' || href === '/index.html'))) {
      a.classList.add('active');
    }
  });

  // Chat visibility (mirrors member-auth.js logic for the rebuilt menu)
  const allowedRoles = ['player', 'alumni', 'coach', 'rep', 'admin', 'superadmin'];
  function applyChatVisibility(canSeeChat) {
    document.querySelectorAll('a[href="/chat"]').forEach(link => {
      const li = link.closest('li');
      if (li) li.style.display = canSeeChat ? '' : 'none';
    });
  }
  applyChatVisibility(false);
  onAuthStateChanged(auth, async (user) => {
    if (!user) { applyChatVisibility(false); return; }
    try {
      const mSnap = await getDoc(doc(db, 'members', user.uid));
      const profile = mSnap.exists() ? mSnap.data() : null;
      if (profile && user.email === 'coachberry03@gmail.com') profile.role = 'superadmin';
      applyChatVisibility(!!(profile && allowedRoles.includes(profile.role)));
    } catch (e) { applyChatVisibility(false); }
  });

  // Mobile dropdown toggle (tap category to expand submenu)
  ul.querySelectorAll('.nav-dropdown-toggle').forEach(toggle => {
    toggle.addEventListener('click', e => {
      if (window.matchMedia('(max-width: 768px)').matches) {
        e.preventDefault();
        toggle.closest('.nav-dropdown').classList.toggle('open-sub');
      }
    });
  });

  reveal();
}

init();
