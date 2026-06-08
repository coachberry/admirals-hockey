// ============================================
// MEMBER AUTH - shared across all pages
// Load this after Firebase imports
// ============================================

import { initializeApp, getApps } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, signOut, updateProfile } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

// Current member state
window.currentMember = null;

// ============================================
// MODAL MANAGEMENT
// ============================================
function showMemberModal(view = 'login') {
  const modal = document.getElementById('memberModal');
  if (!modal) return;
  modal.classList.add('active');
  showMemberView(view);
}

function hideMemberModal() {
  const modal = document.getElementById('memberModal');
  if (modal) modal.classList.remove('active');
}

function showMemberView(view) {
  document.querySelectorAll('.member-view').forEach(v => v.style.display = 'none');
  const el = document.getElementById('memberView_' + view);
  if (el) el.style.display = 'block';
  clearMemberErrors();
}

function clearMemberErrors() {
  document.querySelectorAll('.member-error').forEach(e => e.textContent = '');
}

function setMemberError(id, msg) {
  const el = document.getElementById(id);
  if (el) el.textContent = msg;
}

// ============================================
// AUTH ACTIONS
// ============================================
async function ensureMemberProfile(user) {
  const ref = doc(db, 'members', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email.split('@')[0],
      photoURL: user.photoURL || '',
      role: 'member',
      status: 'active',
      createdAt: new Date().toISOString()
    });
  }
  return (await getDoc(ref)).data();
}

// Sign up
async function memberSignUp() {
  const name = document.getElementById('signupName')?.value.trim();
  const email = document.getElementById('signupEmail')?.value.trim();
  const password = document.getElementById('signupPassword')?.value;
  const confirm = document.getElementById('signupConfirm')?.value;

  if (!name) { setMemberError('signupError', 'Please enter your name.'); return; }
  if (!email) { setMemberError('signupError', 'Please enter your email.'); return; }
  if (!password || password.length < 6) { setMemberError('signupError', 'Password must be at least 6 characters.'); return; }
  if (password !== confirm) { setMemberError('signupError', 'Passwords do not match.'); return; }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await ensureMemberProfile({ ...cred.user, displayName: name });
    hideMemberModal();
  } catch(e) {
    setMemberError('signupError', e.code === 'auth/email-already-in-use' ? 'Email already in use.' : e.message);
  }
}

// Sign in
async function memberSignIn() {
  const email = document.getElementById('loginEmail')?.value.trim();
  const password = document.getElementById('loginPassword')?.value;
  if (!email || !password) { setMemberError('loginError', 'Please enter email and password.'); return; }
  try {
    await signInWithEmailAndPassword(auth, email, password);
    hideMemberModal();
  } catch(e) {
    setMemberError('loginError', 'Invalid email or password.');
  }
}

// Google sign in
async function memberGoogleSignIn() {
  try {
    const cred = await signInWithPopup(auth, googleProvider);
    await ensureMemberProfile(cred.user);
    hideMemberModal();
  } catch(e) {
    setMemberError('loginError', e.message);
  }
}

// Sign out
async function memberSignOut() {
  await signOut(auth);
}

// ============================================
// ROLE REQUEST
// ============================================
async function submitRoleRequest() {
  if (!window.currentMember) return;
  const role = document.getElementById('roleRequestType')?.value;
  if (!role) { setMemberError('roleRequestError', 'Please select a role.'); return; }

  const data = {
    uid: window.currentMember.uid,
    memberName: window.currentMember.displayName,
    email: window.currentMember.email,
    requestedRole: role,
    status: 'pending',
    createdAt: new Date().toISOString()
  };

  if (role === 'player') {
    data.gradYear = document.getElementById('roleGradYear')?.value;
    data.position = document.getElementById('rolePosition')?.value;
    if (!data.gradYear || !data.position) { setMemberError('roleRequestError', 'Please fill in all fields.'); return; }
  } else if (role === 'family') {
    data.playerName = document.getElementById('rolePlayerName')?.value.trim();
    data.relationship = document.getElementById('roleRelationship')?.value;
    if (!data.playerName || !data.relationship) { setMemberError('roleRequestError', 'Please fill in all fields.'); return; }
  } else if (role === 'alumni') {
    data.gradYear = document.getElementById('roleAlumniGradYear')?.value;
    data.yearsPlayed = document.getElementById('roleYearsPlayed')?.value.trim();
    if (!data.gradYear || !data.yearsPlayed) { setMemberError('roleRequestError', 'Please fill in all fields.'); return; }
  }

  await addDoc(collection(db, 'roleRequests'), data);
  showMemberView('dashboard');
  loadMemberDashboard(window.currentMember);
}

// ============================================
// DASHBOARD
// ============================================
async function loadMemberDashboard(member) {
  const nameEl = document.getElementById('dashboardName');
  const roleEl = document.getElementById('dashboardRole');
  const pendingEl = document.getElementById('dashboardPending');
  if (nameEl) nameEl.textContent = member.displayName;
  if (roleEl) roleEl.textContent = member.role.charAt(0).toUpperCase() + member.role.slice(1);

  // Check pending role requests
  const { getDocs, query, where } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js");
  const q = query(collection(db, 'roleRequests'), where('uid', '==', member.uid), where('status', '==', 'pending'));
  const snap = await getDocs(q);
  if (pendingEl) {
    pendingEl.textContent = snap.empty ? '' : `⏳ Role request pending approval`;
    pendingEl.style.display = snap.empty ? 'none' : 'block';
  }
}

// ============================================
// AUTH STATE LISTENER
// ============================================
onAuthStateChanged(auth, async (user) => {
  const btn = document.getElementById('memberNavBtn');
  if (user) {
    const profile = await ensureMemberProfile(user);
    window.currentMember = { ...profile, uid: user.uid };
    if (btn) {
      btn.textContent = user.displayName?.split(' ')[0] || 'Account';
      btn.onclick = () => { showMemberView('dashboard'); showMemberModal('dashboard'); loadMemberDashboard(window.currentMember); };
    }
  } else {
    window.currentMember = null;
    if (btn) {
      btn.textContent = 'Member Login';
      btn.onclick = () => showMemberModal('login');
    }
  }
});

// ============================================
// EXPOSE TO WINDOW
// ============================================
window.showMemberModal = showMemberModal;
window.hideMemberModal = hideMemberModal;
window.showMemberView = showMemberView;
window.memberSignUp = memberSignUp;
window.memberSignIn = memberSignIn;
window.memberGoogleSignIn = memberGoogleSignIn;
window.memberSignOut = memberSignOut;
window.submitRoleRequest = submitRoleRequest;

export { auth, db, currentMember };
