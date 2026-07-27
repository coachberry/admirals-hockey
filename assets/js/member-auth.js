// ============================================
// MEMBER AUTH v3
// ============================================
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { initPushNotifications } from "/assets/js/push-notifications.js?v=1";
import { initNotificationCenter } from "/assets/js/notifications.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAleQHLvA75qr5a-bAuIZKCUyGiZ8jTJbE",
  authDomain: "admirals-hockey.firebaseapp.com",
  projectId: "admirals-hockey",
  storageBucket: "admirals-hockey.firebasestorage.app",
  messagingSenderId: "783358659334",
  appId: "1:783358659334:web:5daffd093adca386faec87"
};

const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

window.currentMember = null;

window.sendPasswordReset = async function() {
  const emailEl = document.getElementById('loginEmail');
  const email = emailEl ? emailEl.value.trim() : '';
  if (!email) {
    alert('Please enter your email address first, then click Forgot Password?');
    return;
  }
  try {
    const { sendPasswordResetEmail } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js');
    await sendPasswordResetEmail(auth, email);
    alert('Password reset email sent to ' + email + '. Check your inbox.');
  } catch(err) {
    alert('Error: ' + err.message);
  }
};

// Helper: check if a profile has a given role (checks roles array, teams, and legacy role string)
window.hasRole = function(profile, role) {
  if (!profile) return false;
  if (Array.isArray(profile.roles) && profile.roles.includes(role)) return true;
  if (Array.isArray(profile.teams) && profile.teams.includes(role)) return true;
  if (profile.role === role) return true;
  return false;
};

window.hasAnyRole = function(profile, roles) {
  if (!profile) return false;
  return roles.some(r => window.hasRole(profile, r));
};

// ============================================
// MODAL
// ============================================
function showMemberModal(view) {
  const modal = document.getElementById('memberModal');
  if (!modal) return;
  modal.classList.add('active');
  showMemberView(view || 'login');
}

function hideMemberModal() {
  const modal = document.getElementById('memberModal');
  if (modal) modal.classList.remove('active');
}

function showMemberView(view) {
  document.querySelectorAll('.member-view').forEach(v => v.style.display = 'none');
  const el = document.getElementById('memberView_' + view);
  if (el) el.style.display = 'block';
  clearErrors();
}

function clearErrors() {
  document.querySelectorAll('.member-error').forEach(e => e.textContent = '');
}

function setError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

// ============================================
// SIGN IN
// ============================================
async function doSignIn() {
  const email = document.getElementById('loginEmail')?.value.trim();
  const password = document.getElementById('loginPassword')?.value;
  if (!email || !password) { setError('loginError', 'Please enter email and password.'); return; }
  try {
    await signInWithEmailAndPassword(auth, email, password);
    hideMemberModal();
  } catch(e) {
    setError('loginError', 'Invalid email or password.');
  }
}

async function doGoogleSignIn() {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    const snap = await getDoc(doc(db, 'members', cred.user.uid));
    if (!snap.exists()) {
      // New Google user - create profile immediately, active as member
      await setDoc(doc(db, 'members', cred.user.uid), {
        uid: cred.user.uid,
        email: cred.user.email,
        displayName: cred.user.displayName || cred.user.email,
        role: 'member',
        status: 'active',
        googleSignUp: true,
        createdAt: new Date().toISOString()
      });
    }
    hideMemberModal();
    // If on profile page, reload to show alert
    if (window.location.pathname === '/profile') window.location.reload();
  } catch(e) {
    setError('loginError', e.message);
  }
}

async function doSignOut() {
  await signOut(auth);
  window.currentMember = null;
  // Clear Firebase auth persistence so next visitor starts fresh
  try {
    const dbs = await indexedDB.databases();
    dbs.forEach(db => { if (db.name && db.name.includes('firebase')) indexedDB.deleteDatabase(db.name); });
  } catch(e) {}
  // Clear any local/session storage auth keys
  Object.keys(localStorage).forEach(k => { if (k.includes('firebase') || k.includes('google')) localStorage.removeItem(k); });
}

// ============================================
// SIGN UP (email/password)
// ============================================
async function doApply() {
  const name = document.getElementById('applyName')?.value.trim();
  const email = document.getElementById('applyEmail')?.value.trim();
  const password = document.getElementById('applyPassword')?.value;
  const confirm = document.getElementById('applyConfirm')?.value;
  const roleType = document.getElementById('applyRoleType')?.value;
  const phone = document.getElementById('applyPhone')?.value.trim();

  if (!name) { setError('applyError', 'Please enter your name.'); return; }
  if (!email) { setError('applyError', 'Please enter your email.'); return; }
  if (!password || password.length < 6) { setError('applyError', 'Password must be at least 6 characters.'); return; }
  if (password !== confirm) { setError('applyError', 'Passwords do not match.'); return; }

  const roleData = { requestedRole: roleType || 'member' };

  if (roleType === 'player' || roleType === 'prospect') {
    const gradYear = document.getElementById(roleType === 'player' ? 'applyGradYear' : 'applyProspectGradYear')?.value;
    const position = document.getElementById(roleType === 'player' ? 'applyPosition' : 'applyProspectPosition')?.value;
    if (!gradYear || !position) { setError('applyError', 'Please fill in all required fields.'); return; }
    roleData.gradYear = gradYear;
    roleData.position = position;
  } else if (roleType === 'alumni') {
    const gradYear = document.getElementById('applyAlumniGradYear')?.value;
    const yearsPlayed = document.getElementById('applyYearsPlayed')?.value.trim();
    if (!gradYear || !yearsPlayed) { setError('applyError', 'Please fill in all required fields.'); return; }
    roleData.gradYear = gradYear;
    roleData.yearsPlayed = yearsPlayed;
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    const uid = cred.user.uid;

    // Create member profile - active immediately as 'member'
    await setDoc(doc(db, 'members', uid), {
      uid,
      email,
      displayName: name,
      phone: phone || '',
      role: 'member',
      status: 'active',
      createdAt: new Date().toISOString()
    });

    // Create role request
    if (roleType) {
      await addDoc(collection(db, 'roleRequests'), {
        uid,
        memberName: name,
        email,
        ...roleData,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
    }

    hideMemberModal();
  } catch(e) {
    setError('applyError', e.code === 'auth/email-already-in-use' ? 'Email already in use. Try logging in.' : e.message);
  }
}

// ============================================
// AUTH STATE
// ============================================
onAuthStateChanged(auth, async (user) => {
  const loginBtn = document.getElementById('memberNavBtn');
  const signupBtn = document.getElementById('memberSignupBtn');

  if (user) {
    const snap = await getDoc(doc(db, 'members', user.uid));
    const profile = snap.exists() ? snap.data() : { role: 'member', status: 'active', displayName: user.displayName };
    window.currentMember = { ...profile, uid: user.uid };

    // Set up push notifications (non-blocking)
    initPushNotifications(app, user).catch(() => {});

    // Set up in-app notification center
    try { initNotificationCenter(app, user.uid); } catch(e) {}

    if (loginBtn) {
      loginBtn.textContent = 'My Profile';
      loginBtn.onclick = () => { window.location.href = '/profile'; };
    }
    if (signupBtn) signupBtn.style.display = 'none';

    const logoutBtn = document.getElementById('memberLogoutBtn');
    if (logoutBtn) {
      logoutBtn.style.display = 'inline-flex';
      logoutBtn.onclick = async () => { await doSignOut(); window.location.href = '/index.html'; };
    }

    const adminBtn = document.getElementById('adminDashboardBtn');
    if (adminBtn) {
      const isSuperAdmin = user.email === 'coachberry03@gmail.com';
      if (isSuperAdmin || profile.isAdmin) {
        adminBtn.style.display = 'inline-block';
      } else {
        adminBtn.style.display = 'none';
      }
    }
  } else {
    window.currentMember = null;
    if (loginBtn) {
      loginBtn.textContent = 'Login';
      loginBtn.onclick = () => showMemberModal('login');
    }
    if (signupBtn) signupBtn.style.display = '';
    const adminBtn = document.getElementById('adminDashboardBtn');
    if (adminBtn) adminBtn.style.display = 'none';
    const logoutBtn2 = document.getElementById('memberLogoutBtn');
    if (logoutBtn2) logoutBtn2.style.display = 'none';
  }
});

// ============================================
// EXPOSE TO WINDOW
// ============================================
window.showMemberModal = showMemberModal;
window.hideMemberModal = hideMemberModal;
window.showMemberView = showMemberView;
window.memberSignIn = doSignIn;
window.memberGoogleSignIn = doGoogleSignIn;
window.memberSignOut = doSignOut;
window.memberApply = doApply;

window.showApplyFields = function(role) {
  ['player', 'prospect', 'alumni'].forEach(r => {
    const el = document.getElementById('applyFields_' + r);
    if (el) el.style.display = r === role ? 'block' : 'none';
  });
};

const modal = document.getElementById('memberModal');
if (modal) modal.addEventListener('click', e => { if (e.target === modal) hideMemberModal(); });

const signupBtn = document.getElementById('memberSignupBtn');
if (signupBtn) signupBtn.onclick = () => showMemberModal('apply');

// ============================================
// MOBILE AUTH BUTTONS SYNC
// ============================================
function syncMobileAuthButtons() {
  const container = document.getElementById('mobileAuthButtons');
  if (!container) return;
  container.innerHTML = '';
  const configs = [
    { id: 'adminDashboardBtn', cls: 'mab-admin' },
    { id: 'memberNavBtn',      cls: 'mab-profile' },
    { id: 'memberSignupBtn',   cls: 'mab-signup' },
    { id: 'memberLogoutBtn',   cls: 'mab-logout' },
  ];
  configs.forEach(({ id, cls }) => {
    const original = document.getElementById(id);
    if (!original || original.style.display === 'none') return;
    const btn = document.createElement('button');
    btn.className = 'mab-btn ' + cls;
    btn.textContent = original.textContent;
    btn.addEventListener('click', () => original.click());
    container.appendChild(btn);
  });
}
window.syncMobileAuthButtons = syncMobileAuthButtons;

let _mobileAuthTimer = null;
onAuthStateChanged(auth, () => {
  if (_mobileAuthTimer) clearTimeout(_mobileAuthTimer);
  _mobileAuthTimer = setTimeout(syncMobileAuthButtons, 600);
});

document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('navToggle');
  if (toggle) toggle.addEventListener('click', () => setTimeout(syncMobileAuthButtons, 0));
});

// ============================================
// CHAT NAV VISIBILITY
// ============================================
function updateChatNavVisibility(profile) {
  const allowedRoles = ['player', 'alumni', 'coach', 'rep', 'admin', 'superadmin', 'jv', 'varsity'];
  const canSeeChat = profile && window.hasAnyRole(profile, allowedRoles);
  document.querySelectorAll('a[href="/chat"]').forEach(link => {
    const li = link.closest('li');
    if (li) li.style.display = canSeeChat ? '' : 'none';
    const p = link.closest('p');
    if (p) p.style.display = canSeeChat ? '' : 'none';
  });
}
window.updateChatNavVisibility = updateChatNavVisibility;
updateChatNavVisibility(null);
onAuthStateChanged(auth, async (user) => {
  if (!user) { updateChatNavVisibility(null); return; }
  const snap = await getDoc(doc(db, 'members', user.uid));
  const profile = snap.exists() ? snap.data() : null;
  if (profile && user.email === 'coachberry03@gmail.com') profile.role = 'superadmin';
  updateChatNavVisibility(profile);
});
