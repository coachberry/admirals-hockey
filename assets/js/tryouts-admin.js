import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getFirestore, collection, getDocs, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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

const tab = document.getElementById('tryoutsTab');
if (!tab) return;

const DEFAULT_WHO = "We welcome players of all experience levels who attend or are eligible to attend Franklin High School. Whether you've been skating your whole life or are newer to the sport, we encourage you to come out and show us what you've got.\n\n- Current Franklin High School students in grades 9-12\n- Incoming freshmen for the upcoming school year\n- Returning players from last season's roster\n- Transfer students who meet TSSAA eligibility requirements\n- All positions - forwards, defensemen, and goaltenders";

const DEFAULT_EXPECT = "Tryouts are designed to evaluate skating ability, hockey sense, compete level, and coachability. We look for players who bring energy, work hard, and are committed to the team.\n\nSkating: Edge work, speed, agility, and backward skating drills\nPuck Skills: Stickhandling, passing, and shooting evaluation\nCompete: Small-area games and competitive drills\nResults: Roster decisions communicated TBD";

const DEFAULT_FAQ = "Q: Do I need to register before tryouts?\nA: Yes - please complete the registration form on this page before attending tryouts. This helps us plan ice time and ensure we have your information on file.\n\nQ: I've never played organized hockey before. Can I still try out?\nA: Absolutely. We evaluate players based on their potential and work ethic, not just experience. If you can skate and love the game, come out and give it a shot.\n\nQ: I played last season. Do I still need to register?\nA: Yes - all players, returning and new, must complete the registration form and attend tryouts.\n\nQ: Who do I contact with questions?\nA: Reach out to Coach Matt Berry at coachberry03@gmail.com";

const DEFAULT_EMBED = `<div class="notice-banner">
  ✅ Submitting this form does not guarantee a roster spot — it registers you for tryouts.
</div>
<iframe
  id="JotFormIFrame-261519024119149"
  title="Tryout Registration"
  onload="window.parent.scrollTo(0,0)"
  allowtransparency="true"
  allow="geolocation; microphone; camera; fullscreen; payment"
  src="https://form.jotform.com/261519024119149"
  frameborder="0"
  style="min-width:100%;max-width:100%;height:539px;border:none;"
  scrolling="no"
></iframe>
<script src='https://cdn.jotfor.ms/s/umd/latest/for-form-embed-handler.js'></script>
<script>window.jotformEmbedHandler("iframe[id='JotFormIFrame-261519024119149']", "https://form.jotform.com/")</script>`;

let tryoutsSeasons = [];
let currentTryoutsSeasonId = null;

async function loadTryoutsData(seasonId) {
  const snap = await getDoc(doc(db, 'tryouts', seasonId));
  const data = snap.exists() ? snap.data() : {};
  document.getElementById('tryoutsDate').value = data.date || '';
  document.getElementById('tryoutsTime').value = data.time || '';
  document.getElementById('tryoutsLocation').value = data.location || '';
  document.getElementById('tryoutsCost').value = data.cost || '';
  document.getElementById('tryoutsWhoTitle').value = data.whoTitle || '🏒 Who Should Try Out?';
  document.getElementById('tryoutsExpectTitle').value = data.expectTitle || '⭐ What to Expect';
  document.getElementById('tryoutsFAQTitle').value = data.faqTitle || '❓ Frequently Asked Questions';
  document.getElementById('tryoutsWho').value = data.whoText || DEFAULT_WHO;
  document.getElementById('tryoutsExpect').value = data.expectText || DEFAULT_EXPECT;
  document.getElementById('tryoutsFAQ').value = data.faqText || DEFAULT_FAQ;
  document.getElementById('tryoutsEmbed').value = data.embedCode || DEFAULT_EMBED;
}

async function loadTryoutsSeasons() {
  const snap = await getDocs(collection(db, 'seasons'));
  tryoutsSeasons = [];
  snap.forEach(d => tryoutsSeasons.push({ id: d.id, ...d.data() }));
  tryoutsSeasons.sort((a, b) => b.label.localeCompare(a.label));

  const select = document.getElementById('tryoutsSeasonSelect');
  select.innerHTML = tryoutsSeasons.map(s =>
    `<option value="${s.id}" ${s.current ? 'selected' : ''}>${s.label}${s.current ? ' (Current)' : ''}</option>`
  ).join('');

  if (!tryoutsSeasons.length) {
    select.innerHTML = '<option value="">No seasons - create one in the Seasons tab first</option>';
    return;
  }

  const current = tryoutsSeasons.find(s => s.current) || tryoutsSeasons[0];
  currentTryoutsSeasonId = current.id;
  await loadTryoutsData(currentTryoutsSeasonId);

  select.addEventListener('change', async e => {
    currentTryoutsSeasonId = e.target.value;
    await loadTryoutsData(currentTryoutsSeasonId);
  });
}

document.getElementById('saveTryoutsBtn').addEventListener('click', async () => {
  if (!currentTryoutsSeasonId) { alert('Please create a season first (Seasons tab).'); return; }
  const payload = {
    date: document.getElementById('tryoutsDate').value.trim(),
    time: document.getElementById('tryoutsTime').value.trim(),
    location: document.getElementById('tryoutsLocation').value.trim(),
    cost: document.getElementById('tryoutsCost').value.trim(),
    whoTitle: document.getElementById('tryoutsWhoTitle').value.trim(),
    expectTitle: document.getElementById('tryoutsExpectTitle').value.trim(),
    faqTitle: document.getElementById('tryoutsFAQTitle').value.trim(),
    whoText: document.getElementById('tryoutsWho').value,
    expectText: document.getElementById('tryoutsExpect').value,
    faqText: document.getElementById('tryoutsFAQ').value,
    embedCode: document.getElementById('tryoutsEmbed').value,
    updatedAt: new Date().toISOString()
  };
  await setDoc(doc(db, 'tryouts', currentTryoutsSeasonId), payload, { merge: true });
  const status = document.getElementById('tryoutsSaveStatus');
  status.textContent = '✅ Saved!';
  setTimeout(() => { status.textContent = ''; }, 2500);
});

// Reload season list/data whenever the Tryouts tab is opened
document.querySelector('[data-tab="tryouts"]').addEventListener('click', () => {
  loadTryoutsSeasons();
});

loadTryoutsSeasons();

});
