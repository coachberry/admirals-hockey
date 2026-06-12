// ============================================
// MEMBER AUTH v2
// ============================================
import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
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

window.currentMember = null;

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
    // Check if they have a profile already
    const snap = await getDoc(doc(db, 'members', cred.user.uid));
    if (!snap.exists()) {
      // New Google user - send to apply flow
      window._pendingGoogleUser = cred.user;
      showMemberView('apply');
      if (document.getElementById('applyName')) document.getElementById('applyName').value = cred.user.displayName || '';
      if (document.getElementById('applyEmail')) document.getElementById('applyEmail').value = cred.user.email || '';
    } else {
      hideMemberModal();
    }
  } catch(e) {
    setError('loginError', e.message);
  }
}

async function doSignOut() {
  await signOut(auth);
  window.currentMember = null;
}

// ============================================
// APPLY (new account creation)
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

  // If not Google sign-in, validate password
  if (!window._pendingGoogleUser) {
    if (!password || password.length < 6) { setError('applyError', 'Password must be at least 6 characters.'); return; }
    if (password !== confirm) { setError('applyError', 'Passwords do not match.'); return; }
  }

  const applicationData = {
    displayName: name,
    email,
    phone: phone || '',
    requestedRole: roleType || 'member',
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  if (roleType === 'player' || roleType === 'prospect') {
    const gradYear = document.getElementById(roleType === 'player' ? 'applyGradYear' : 'applyProspectGradYear')?.value;
    const position = document.getElementById(roleType === 'player' ? 'applyPosition' : 'applyProspectPosition')?.value;
    if (!gradYear || !position) { setError('applyError', 'Please fill in all required fields.'); return; }
    applicationData.gradYear = gradYear;
    applicationData.position = position;
  } else if (roleType === 'alumni') {
    const gradYear = document.getElementById('applyAlumniGradYear')?.value;
    const yearsPlayed = document.getElementById('applyYearsPlayed')?.value.trim();
    if (!gradYear || !yearsPlayed) { setError('applyError', 'Please fill in all required fields.'); return; }
    applicationData.gradYear = gradYear;
    applicationData.yearsPlayed = yearsPlayed;
  }

  try {
    let uid;
    let displayName = name;

    if (window._pendingGoogleUser) {
      uid = window._pendingGoogleUser.uid;
      await updateProfile(window._pendingGoogleUser, { displayName: name });
      window._pendingGoogleUser = null;
    } else {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      uid = cred.user.uid;
    }

    // Create member profile with pending status
    await setDoc(doc(db, 'members', uid), {
      uid,
      email,
      displayName: name,
      phone: phone || '',
      role: 'member',
      status: 'pending',
      requestedRole: roleType || 'member',
      createdAt: new Date().toISOString()
    });

    // Also create an application record
    await addDoc(collection(db, 'applications'), {
      uid,
      ...applicationData
    });

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
    const profile = snap.exists() ? snap.data() : { role: 'member', status: 'pending', displayName: user.displayName };
    window.currentMember = { ...profile, uid: user.uid };

    if (loginBtn) {
      loginBtn.textContent = 'My Profile';
      loginBtn.onclick = () => { window.location.href = '/profile'; };
    }
    if (signupBtn) signupBtn.style.display = 'none';

    // Show Logout button
    const logoutBtn = document.getElementById('memberLogoutBtn');
    if (logoutBtn) {
      logoutBtn.style.display = 'inline-flex';
      logoutBtn.onclick = async () => { await doSignOut(); window.location.href = '/index.html'; };
    }

    // Show Admin Dashboard button for admins/superadmins
    const adminBtn = document.getElementById('adminDashboardBtn');
    if (adminBtn) {
      const role = profile.role || 'member';
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

// Show/hide role-specific fields in apply form
window.showApplyFields = function(role) {
  ['player', 'prospect', 'alumni'].forEach(r => {
    const el = document.getElementById('applyFields_' + r);
    if (el) el.style.display = r === role ? 'block' : 'none';
  });
};

// Modal overlay close
const modal = document.getElementById('memberModal');
if (modal) modal.addEventListener('click', e => { if (e.target === modal) hideMemberModal(); });

// Button listeners
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

onAuthStateChanged(auth, () => {
  setTimeout(syncMobileAuthButtons, 100);
});

// Re-sync mobile auth buttons whenever hamburger menu opens (safety net)
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('navToggle');
  if (toggle) toggle.addEventListener('click', () => setTimeout(syncMobileAuthButtons, 0));
});

// ============================================
// HIDE TEAM CHAT NAV LINK FOR UNAUTHORIZED USERS
// ============================================
function updateChatNavVisibility(profile) {
  const allowedRoles = ['player', 'alumni', 'coach', 'rep', 'admin', 'superadmin'];
  const canSeeChat = profile && allowedRoles.includes(profile.role);

  document.querySelectorAll('a[href="/chat"]').forEach(link => {
    const li = link.closest('li');
    if (li) li.style.display = canSeeChat ? '' : 'none';
    const p = link.closest('p');
    if (p) p.style.display = canSeeChat ? '' : 'none';
  });
}
window.updateChatNavVisibility = updateChatNavVisibility;

// Hide chat nav by default, update once auth resolves
updateChatNavVisibility(null);
onAuthStateChanged(auth, async (user) => {
  if (!user) { updateChatNavVisibility(null); return; }
  const snap = await getDoc(doc(db, 'members', user.uid));
  const profile = snap.exists() ? snap.data() : null;
  if (profile && user.email === 'coachberry03@gmail.com') profile.role = 'superadmin';
  updateChatNavVisibility(profile);
});
