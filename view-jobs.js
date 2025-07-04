import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getDatabase, ref, onValue, set, remove, push } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDcxQLLka_eZ5tduUW3zEAKKdKMvebeXRI",
  authDomain: "job-card-8bb4b.firebaseapp.com",
  databaseURL: "https://job-card-8bb4b-default-rtdb.firebaseio.com",
  projectId: "job-card-8bb4b",
  storageBucket: "job-card-8bb4b.firebasestorage.app",
  messagingSenderId: "355622785459",
  appId: "1:355622785459:web:fc49655132c77fb9cbfbc6",
  measurementId: "G-T7EET4NRQR"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);

const jobsTableBody = document.querySelector('#jobsTable tbody');
const statusDiv = document.getElementById('status');
const personModal = document.getElementById('personModal');
const personSelect = document.getElementById('personSelect');
const selectPersonBtn = document.getElementById('selectPersonBtn');
const changePersonBtn = document.getElementById('changePersonBtn');
const clientListDiv = document.getElementById('clientList');
const clientModal = document.getElementById('clientModal');
const clientModalContent = document.getElementById('clientModalContent');

let allJobs = [];
let jobKeyMap = {};
let selectedPerson = null;
const allowedPeople = ["Andre", "Francois", "Yolandie", "Neil"];

function populatePersonSelect(people) {
    personSelect.innerHTML = '<option value="">-- Select Person --</option>';
    allowedPeople.forEach(person => {
        const option = document.createElement('option');
        option.value = person;
        option.textContent = person;
        personSelect.appendChild(option);
    });
}

function showPersonModal() {
    personModal.style.display = 'flex';
    changePersonBtn.style.display = 'none';
}

function hidePersonModal() {
    personModal.style.display = 'none';
    changePersonBtn.style.display = 'inline-block';
}

function loadJobsAndPeople() {
    const jobsRef = ref(database, 'jobCards');
    onValue(jobsRef, (snapshot) => {
        allJobs = [];
        jobKeyMap = {};
        if (snapshot.exists()) {
            const val = snapshot.val();
            for (const [key, job] of Object.entries(val)) {
                allJobs.push({...job, _key: key});
                jobKeyMap[job.id || job.customerCell || key] = key;
            }
            // Get unique people from assignedTo
            const peopleSet = new Set();
            allJobs.forEach(job => {
                if (job.assignedTo) peopleSet.add(job.assignedTo);
            });
            const people = Array.from(peopleSet).sort();
            populatePersonSelect(people);
            renderClientList();
            if (statusDiv) statusDiv.textContent = '';
        } else {
            allJobs = [];
            jobKeyMap = {};
            populatePersonSelect([]);
            renderClientList();
            if (statusDiv) statusDiv.textContent = 'No jobs found.';
        }
    }, (error) => {
        if (statusDiv) statusDiv.textContent = 'Error loading jobs: ' + error.message;
    });
}

selectPersonBtn.addEventListener('click', () => {
    const person = personSelect.value;
    if (!person) {
        if (statusDiv) statusDiv.textContent = 'Please select a person.';
        return;
    }
    selectedPerson = person;
    hidePersonModal();
    renderJobsForPerson(selectedPerson);
});

changePersonBtn.addEventListener('click', () => {
    selectedPerson = null;
    showPersonModal();
    jobsTableBody.innerHTML = '';
    if (statusDiv) statusDiv.textContent = '';
});

// Initial load
showPersonModal();
loadJobsAndPeople();

// Modal logic
const descModal = document.getElementById('descModal');
const descModalContent = document.getElementById('descModalContent');
const jobNotesInput = document.getElementById('jobNotesInput');
const saveNotesBtn = document.getElementById('saveNotesBtn');
const closeDescModal = document.getElementById('closeDescModal');
let currentModalJobId = null;
let currentModalMode = 'desc';

function openDescModal(jobId, mode) {
    currentModalJobId = jobId;
    currentModalMode = mode;
    const job = allJobs.find(j => (j.id || j.customerCell || '') == jobId);
    if (!job) return;
    descModal.style.display = 'flex';
    if (mode === 'desc') {
        descModalContent.textContent = job.jobDescription || '';
        jobNotesInput.style.display = 'none';
        saveNotesBtn.style.display = 'none';
        descModalContent.style.display = 'block';
    } else {
        descModalContent.style.display = 'none';
        jobNotesInput.style.display = 'block';
        saveNotesBtn.style.display = 'block';
        jobNotesInput.value = localStorage.getItem('jobNotes_' + jobId) || '';
    }
}
closeDescModal.addEventListener('click', () => {
    descModal.style.display = 'none';
    currentModalJobId = null;
});
saveNotesBtn.addEventListener('click', () => {
    if (!currentModalJobId) return;
    localStorage.setItem('jobNotes_' + currentModalJobId, jobNotesInput.value);
    descModal.style.display = 'none';
    renderJobsForPerson(selectedPerson);
});
descModal.addEventListener('click', (e) => {
    if (e.target === descModal) descModal.style.display = 'none';
});

// Recycle bin logic
function isJobInRecycle(job) {
    const recycle = getRecycleBin();
    return recycle.some(j => j.jobId === job._key);
}
function getRecycleBin() {
    let recycle = localStorage.getItem('recycleBin');
    if (!recycle) return [];
    try { return JSON.parse(recycle); } catch { return []; }
}
function setRecycleBin(arr) {
    localStorage.setItem('recycleBin', JSON.stringify(arr));
}
function addToRecycleBin(job) {
    const recycle = getRecycleBin();
    recycle.push({
        jobId: job._key,
        job,
        deletedOn: Date.now()
    });
    setRecycleBin(recycle);
}
function removeFromRecycleBin(jobId) {
    let recycle = getRecycleBin();
    recycle = recycle.filter(j => j.jobId !== jobId);
    setRecycleBin(recycle);
}
function cleanOldRecycleBin() {
    let recycle = getRecycleBin();
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const toDelete = recycle.filter(j => j.deletedOn < weekAgo);
    toDelete.forEach(j => {
        // Remove from Firebase
        if (j.job && (j.job.id || j.job.customerCell)) {
            const jobKey = j.job.id || j.job.customerCell;
            remove(ref(database, 'jobCards/' + jobKey));
        }
    });
    recycle = recycle.filter(j => j.deletedOn >= weekAgo);
    setRecycleBin(recycle);
}

// Add event listeners for recycle bin modal
const openRecycleBinBtn = document.getElementById('openRecycleBinBtn');
const recycleBinModal = document.getElementById('recycleBinModal');
const closeRecycleBinBtn = document.getElementById('closeRecycleBinBtn');
openRecycleBinBtn.addEventListener('click', () => {
    renderRecycleBin();
    recycleBinModal.style.display = 'flex';
});
closeRecycleBinBtn.addEventListener('click', () => {
    recycleBinModal.style.display = 'none';
});
document.body.addEventListener('click', function(e) {
    if (e.target === recycleBinModal) {
        recycleBinModal.style.display = 'none';
    }
});

function renderRecycleBin() {
    cleanOldRecycleBin();
    const recycle = getRecycleBin();
    const recycleTable = document.getElementById('recycleTable');
    const recycleStatus = document.getElementById('recycleStatus');
    const tbody = recycleTable.querySelector('tbody');
    tbody.innerHTML = '';
    if (recycle.length === 0) {
        recycleTable.style.display = 'none';
        recycleStatus.textContent = 'Recycle bin is empty.';
        return;
    }
    recycleTable.style.display = '';
    recycleStatus.textContent = '';
    recycle.forEach(j => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${safeField(j.job.customerName)}</td>
            <td>${safeField(j.job.date)}</td>
            <td>${safeField(j.job.customerCell)}</td>
            <td>${safeField((j.job.jobDescription || '').slice(0,40) + ((j.job.jobDescription||'').length>40?'...':''))}</td>
            <td>${safeField(j.job.assignedTo)}</td>
            <td>${safeField(localStorage.getItem('jobNotes_' + (j.job.id || j.job.customerCell || '')))}</td>
            <td>${j.job.deletedOn ? new Date(j.deletedOn).toLocaleDateString() : '—'}</td>
            <td><button class="restore-btn" data-jobid="${j.jobId}">Restore</button></td>
            <td><button class="delete-forever-btn" data-jobid="${j.jobId}">Delete Forever</button></td>
        `;
        tbody.appendChild(tr);
    });
    document.querySelectorAll('.restore-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const jobId = e.target.dataset.jobid;
            // Restore job to Firebase
            const recycle = getRecycleBin();
            const entry = recycle.find(j => j.jobId === jobId);
            if (entry && entry.job) {
                // Use the same key if possible
                const fbKey = jobKeyMap[jobId] || undefined;
                const jobRef = fbKey ? ref(database, 'jobCards/' + fbKey) : push(ref(database, 'jobCards'));
                set(jobRef, entry.job).then(() => {
                    removeFromRecycleBin(jobId);
                    writeLog({user: entry.job.assignedTo, action: 'restored', jobName: entry.job.customerName});
                    renderClientList();
                    renderRecycleBin();
                });
            }
        });
    });
    document.querySelectorAll('.delete-forever-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const jobId = e.target.dataset.jobid;
            const recycle = getRecycleBin();
            const entry = recycle.find(j => j.jobId === jobId);
            removeFromRecycleBin(jobId);
            // Also remove from Firebase
            const fbKey = jobKeyMap[jobId];
            if (fbKey) remove(ref(database, 'jobCards/' + fbKey));
            // Remove from allJobs in memory
            allJobs = allJobs.filter(j => j._key !== jobId);
            writeLog({user: entry && entry.job ? entry.job.assignedTo : '—', action: 'deleted forever', jobName: entry && entry.job ? entry.job.customerName : jobId});
            renderClientList();
            renderRecycleBin();
        });
    });
}

// Delete modal logic
const deleteModal = document.getElementById('deleteModal');
const closeDeleteModal = document.getElementById('closeDeleteModal');
const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
let currentDeleteJobId = null;

window.openDeleteModal = function(jobId) {
    currentDeleteJobId = jobId;
    // Hide all other modals
    if (clientModal) clientModal.style.display = 'none';
    if (descModal) descModal.style.display = 'none';
    if (recycleBinModal) recycleBinModal.style.display = 'none';
    if (logModal) logModal.style.display = 'none';
    deleteModal.style.display = 'flex';
    deleteModal.style.zIndex = '5000';
    // Focus the cancel button for accessibility
    if (cancelDeleteBtn) cancelDeleteBtn.focus();
    // Attach event listener to confirmDeleteBtn every time modal opens
    if (confirmDeleteBtn) {
        confirmDeleteBtn.onclick = function() {
            console.log('Move to Recycle Bin clicked, jobId:', currentDeleteJobId);
            if (!currentDeleteJobId) return;
            // Find job robustly
            const job = allJobs.find(j => jobKeyMap[j.id || j.customerCell || ''] === currentDeleteJobId || (j.id || j.customerCell || '') === currentDeleteJobId);
            if (!job) return;
            addToRecycleBin(job);
            // Remove from Firebase (soft delete)
            const fbKey = jobKeyMap[job.id || job.customerCell || ''] || currentDeleteJobId;
            if (fbKey) remove(ref(database, 'jobCards/' + fbKey));
            writeLog({user: job.assignedTo, action: 'deleted', jobName: job.customerName});
            deleteModal.style.display = 'none';
            renderClientList();
            renderRecycleBin();
            currentDeleteJobId = null;
        };
    }
};

if (closeDeleteModal) closeDeleteModal.addEventListener('click', () => {
    deleteModal.style.display = 'none';
    currentDeleteJobId = null;
});
if (cancelDeleteBtn) cancelDeleteBtn.addEventListener('click', () => {
    deleteModal.style.display = 'none';
    currentDeleteJobId = null;
});
if (deleteModal) deleteModal.addEventListener('click', (e) => {
    if (e.target === deleteModal) {
        deleteModal.style.display = 'none';
        currentDeleteJobId = null;
    }
});

function groupJobsByClient(jobs) {
    const map = new Map();
    jobs.forEach(job => {
        if (!job.customerName) return;
        // Find the original job object from allJobs (by key)
        const original = allJobs.find(j => j._key === job._key);
        const jobRef = original || job;
        if (!map.has(jobRef.customerName)) map.set(jobRef.customerName, []);
        map.get(jobRef.customerName).push(jobRef);
    });
    return map;
}

function renderClientList() {
    clientListDiv.innerHTML = '';
    const clientMap = groupJobsByClient(allJobs.filter(job => !isJobInRecycle(job)));
    if (clientMap.size === 0) {
        if (statusDiv) statusDiv.textContent = 'No jobs found.';
        return;
    }
    if (statusDiv) statusDiv.textContent = '';
    for (const [client, jobs] of clientMap.entries()) {
        const btn = document.createElement('button');
        btn.className = 'client-name';
        btn.textContent = `${client} (${jobs.length})`;
        btn.onclick = () => openClientModal(client, jobs);
        clientListDiv.appendChild(btn);
    }
}

function formatRand(amount) {
    if (!amount || isNaN(amount)) return 'R 0.00';
    return 'R ' + Number(amount).toFixed(2);
}

function safeField(val) {
    return (val !== undefined && val !== null && val !== "") ? val : "—";
}
function safeList(arr) {
    return Array.isArray(arr) && arr.length > 0 ? arr.join(', ') : '—';
}

function openClientModal(client, jobs) {
    let html = `<button class='close-modal-btn' onclick='document.getElementById("clientModal").style.display="none"'>&times;</button>`;
    html += `<h2>${client}</h2>`;
    jobs.forEach((job, idx) => {
        const jobId = job._key;
        html += `<div class='a4-job-details'>
            <h3>Job #${idx + 1}</h3>
            <table>
                <tr><th>Date</th><td>${safeField(job.date)}</td></tr>
                <tr><th>Customer Cell Number</th><td>${safeField(job.customerCell)}</td></tr>
                <tr><th>Email</th><td>${safeField(job.email)}</td></tr>
                <tr><th>Job Total</th><td>${job.jobTotal ? formatRand(job.jobTotal) : '—'}</td></tr>
                <tr><th>Deposit</th><td>${job.deposit ? formatRand(job.deposit) : '—'}</td></tr>
                <tr><th>Balance Due</th><td>${job.balanceDue ? formatRand(job.balanceDue) : '—'}</td></tr>
                <tr><th>Stickers</th><td>${safeList(job.stickers)}</td></tr>
                <tr><th>Other</th><td>${safeList(job.other)}</td></tr>
                <tr><th>Banner/Canvas</th><td>${safeList(job.banner_canvas)}</td></tr>
                <tr><th>Boards</th><td>${safeList(job.boards)}</td></tr>
                <tr><th>Description</th><td>${safeField(job.jobDescription)}</td></tr>
                <tr><th>Assigned To</th><td>${safeField(job.assignedTo)}</td></tr>
            </table>
            <button class='delete-job-btn' data-jobid='${jobId}' style='margin-top:18px;background:#b23c3c;color:#fff;border:none;padding:10px 22px;border-radius:7px;font-size:1rem;cursor:pointer;'>Delete Job</button>
        </div>`;
    });
    clientModalContent.innerHTML = html;
    clientModal.style.display = 'flex';
}

document.body.addEventListener('click', function(e) {
    if (e.target.classList.contains('close-modal-btn')) {
        clientModal.style.display = 'none';
    }
    if (e.target === clientModal) {
        clientModal.style.display = 'none';
    }
    if (e.target.classList.contains('delete-job-btn')) {
        const jobId = e.target.dataset.jobid;
        clientModal.style.display = 'none';
        // Find the job by unique _key
        const job = allJobs.find(j => j._key === jobId);
        console.log('[DELETE DEBUG] Attempting to delete job:', jobId, job);
        if (!job) return;
        addToRecycleBin(job);
        // Remove from Firebase (soft delete)
        if (jobId) {
            remove(ref(database, 'jobCards/' + jobId)).then(() => {
                console.log('[DELETE DEBUG] Successfully removed from Firebase:', jobId);
            }).catch(err => {
                console.error('[DELETE DEBUG] Error removing from Firebase:', jobId, err);
            });
        }
        // Remove from allJobs in memory (robust)
        allJobs = allJobs.filter(j => j._key !== jobId);
        writeLog({user: job.assignedTo, action: 'deleted', jobName: job.customerName});
        renderClientList();
        renderRecycleBin();
    }
});

function renderJobsForPerson(person) {
    // Show only jobs assigned to this person, grouped by client
    clientListDiv.innerHTML = '';
    const jobs = allJobs.filter(job => job.assignedTo === person && !isJobInRecycle(job));
    if (jobs.length === 0) {
        if (statusDiv) statusDiv.textContent = `No jobs found for ${person}.`;
        return;
    }
    if (statusDiv) statusDiv.textContent = '';
    const clientMap = groupJobsByClient(jobs);
    for (const [client, jobs] of clientMap.entries()) {
        const btn = document.createElement('button');
        btn.className = 'client-name';
        btn.textContent = `${client} (${jobs.length})`;
        btn.onclick = () => openClientModal(client, jobs);
        clientListDiv.appendChild(btn);
    }
    // Add a button to return to full client list
    const backBtn = document.createElement('button');
    backBtn.textContent = 'Show All Clients';
    backBtn.className = 'client-name';
    backBtn.style.background = '#eee';
    backBtn.style.color = '#4f2e7d';
    backBtn.style.marginTop = '18px';
    backBtn.onclick = () => {
        selectedPerson = null;
        showPersonModal();
        renderClientList();
    };
    clientListDiv.appendChild(backBtn);
}

// Add a 'View All Jobs' button above the person select dropdown
const personModalContent = document.querySelector('.person-modal-content');
if (personModalContent) {
    const viewAllBtn = document.createElement('button');
    viewAllBtn.textContent = 'View All Jobs';
    viewAllBtn.className = 'select-btn';
    viewAllBtn.style.marginBottom = '18px';
    viewAllBtn.onclick = () => {
        selectedPerson = null;
        hidePersonModal();
        renderClientList();
    };
    personModalContent.insertBefore(viewAllBtn, personModalContent.firstChild);
}

// Log modal logic
const openLogBtn = document.getElementById('openLogBtn');
const logModal = document.getElementById('logModal');
const closeLogModalBtn = document.getElementById('closeLogModalBtn');
const logTable = document.getElementById('logTable');
const logStatus = document.getElementById('logStatus');
openLogBtn.addEventListener('click', () => {
    renderLogTable();
    logModal.style.display = 'flex';
});
closeLogModalBtn.addEventListener('click', () => {
    logModal.style.display = 'none';
});
document.body.addEventListener('click', function(e) {
    if (e.target === logModal) {
        logModal.style.display = 'none';
    }
});

// Function to write a log entry to Firebase
function writeLog({user, action, jobName, details}) {
    const logRef = ref(database, 'logs');
    const entry = {
        timestamp: Date.now(),
        user: user || '—',
        action,
        jobName: jobName || '—',
        details: details || ''
    };
    push(logRef, entry);
}

// Function to render the log table
function renderLogTable() {
    const logsRef = ref(database, 'logs');
    logStatus.textContent = 'Loading...';
    onValue(logsRef, (snapshot) => {
        const tbody = logTable.querySelector('tbody');
        tbody.innerHTML = '';
        if (!snapshot.exists()) {
            logStatus.textContent = 'No log entries.';
            return;
        }
        logStatus.textContent = '';
        // Convert to array and sort by timestamp desc
        const logs = Object.values(snapshot.val()).sort((a, b) => b.timestamp - a.timestamp);
        logs.forEach(log => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}</td>
                <td>${log.user || '—'}</td>
                <td>${log.action || '—'}</td>
                <td>${log.jobName || '—'}</td>
                <td>${log.details || '—'}</td>
            `;
            tbody.appendChild(tr);
        });
    }, (error) => {
        logStatus.textContent = 'Error loading log: ' + error.message;
    });
} 