// ============================================
// MEMBER AUTH
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
// AUTH
// ============================================
async function ensureProfile(user) {
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

async function doSignUp() {
  const name = document.getElementById('signupName')?.value.trim();
  const email = document.getElementById('signupEmail')?.value.trim();
  const password = document.getElementById('signupPassword')?.value;
  const confirm = document.getElementById('signupConfirm')?.value;
  if (!name) { setError('signupError', 'Please enter your name.'); return; }
  if (!email) { setError('signupError', 'Please enter your email.'); return; }
  if (!password || password.length < 6) { setError('signupError', 'Password must be at least 6 characters.'); return; }
  if (password !== confirm) { setError('signupError', 'Passwords do not match.'); return; }
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await ensureProfile({ ...cred.user, displayName: name });
    hideMemberModal();
  } catch(e) {
    setError('signupError', e.code === 'auth/email-already-in-use' ? 'Email already in use.' : e.message);
  }
}

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
    await ensureProfile(cred.user);
    hideMemberModal();
  } catch(e) {
    setError('loginError', e.message);
  }
}

async function doSignOut() {
  await signOut(auth);
}

// ============================================
// ROLE REQUEST
// ============================================
async function doRoleRequest() {
  if (!window.currentMember) return;
  const role = document.getElementById('roleRequestType')?.value;
  if (!role) { setError('roleRequestError', 'Please select a role.'); return; }

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
    if (!data.gradYear || !data.position) { setError('roleRequestError', 'Please fill in all fields.'); return; }
  } else if (role === 'family') {
    data.playerName = document.getElementById('rolePlayerName')?.value.trim();
    data.relationship = document.getElementById('roleRelationship')?.value;
    if (!data.playerName || !data.relationship) { setError('roleRequestError', 'Please fill in all fields.'); return; }
  } else if (role === 'alumni') {
    data.gradYear = document.getElementById('roleAlumniGradYear')?.value;
    data.yearsPlayed = document.getElementById('roleYearsPlayed')?.value.trim();
    if (!data.gradYear || !data.yearsPlayed) { setError('roleRequestError', 'Please fill in all fields.'); return; }
  }

  await addDoc(collection(db, 'roleRequests'), data);
  showMemberView('dashboard');
  loadDashboard(window.currentMember);
}

// ============================================
// DASHBOARD
// ============================================
async function loadDashboard(member) {
  const nameEl = document.getElementById('dashboardName');
  const roleEl = document.getElementById('dashboardRole');
  const pendingEl = document.getElementById('dashboardPending');
  if (nameEl) nameEl.textContent = member.displayName;
  if (roleEl) roleEl.textContent = member.role.charAt(0).toUpperCase() + member.role.slice(1);
  if (pendingEl) {
    const q = query(collection(db, 'roleRequests'), where('uid', '==', member.uid), where('status', '==', 'pending'));
    const snap = await getDocs(q);
    pendingEl.textContent = snap.empty ? '' : '⏳ Role request pending approval';
    pendingEl.style.display = snap.empty ? 'none' : 'block';
  }
}

// ============================================
// AUTH STATE
// ============================================
onAuthStateChanged(auth, async (user) => {
  const loginBtn = document.getElementById('memberNavBtn');
  const signupBtn = document.getElementById('memberSignupBtn');

  if (user) {
    const profile = await ensureProfile(user);
    window.currentMember = { ...profile, uid: user.uid };
    if (loginBtn) {
      loginBtn.textContent = user.displayName?.split(' ')[0] || 'Account';
      loginBtn.onclick = () => { showMemberModal('dashboard'); loadDashboard(window.currentMember); };
    }
    if (signupBtn) signupBtn.style.display = 'none';
  } else {
    window.currentMember = null;
    if (loginBtn) {
      loginBtn.textContent = 'Login';
      loginBtn.onclick = () => showMemberModal('login');
    }
    if (signupBtn) signupBtn.style.display = '';
  }
});

// ============================================
// EXPOSE TO WINDOW
// ============================================
window.showMemberModal = showMemberModal;
window.hideMemberModal = hideMemberModal;
window.showMemberView = showMemberView;
window.memberSignUp = doSignUp;
window.memberSignIn = doSignIn;
window.memberGoogleSignIn = doGoogleSignIn;
window.memberSignOut = doSignOut;
window.submitRoleRequest = doRoleRequest;

// Attach button listeners
const loginBtn = document.getElementById('memberNavBtn');
const signupBtn = document.getElementById('memberSignupBtn');
const modal = document.getElementById('memberModal');

if (loginBtn) loginBtn.addEventListener('click', () => showMemberModal('login'));
if (signupBtn) signupBtn.addEventListener('click', () => showMemberModal('signup'));
if (modal) modal.addEventListener('click', e => { if (e.target === modal) hideMemberModal(); });
