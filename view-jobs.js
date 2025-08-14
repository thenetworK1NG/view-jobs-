import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getDatabase, ref, onValue, set, remove, push, get } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-database.js";

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

// Password system elements
const passwordSection = document.getElementById('passwordSection');
const userPasswordInput = document.getElementById('userPasswordInput');
const passwordStatus = document.getElementById('passwordStatus');
const setPasswordBtn = document.getElementById('setPasswordBtn');
const setPasswordModal = document.getElementById('setPasswordModal');
const setPasswordUser = document.getElementById('setPasswordUser');
const newPasswordInput = document.getElementById('newPasswordInput');
const confirmPasswordInput = document.getElementById('confirmPasswordInput');
const setPasswordStatus = document.getElementById('setPasswordStatus');
const savePasswordBtn = document.getElementById('savePasswordBtn');
const removePasswordBtn = document.getElementById('removePasswordBtn');
const cancelPasswordBtn = document.getElementById('cancelPasswordBtn');

let allJobs = [];
let jobKeyMap = {};
let selectedPerson = null;
let isManualUpdate = false;
let animatedClients = new Set();
let currentFilters = {
    dateFrom: '',
    dateTo: '',
    minTotal: '',
    maxTotal: '',
    productType: '',
    paymentStatus: '',
    jobStatus: '',
    sortBy: 'date-desc'
};
const allowedPeople = ["Andre", "Francois", "Yolandie", "Neil"];

// Kanboard JSON-RPC integration (same API/auth as SearchTask.html)
const KB_BASE_URL = 'http://board.maphefosigns.co.za/jsonrpc.php';
const KB_AUTH = 'Basic ' + btoa('jsonrpc:a328ecd9eef82243d443f6c0e3d9622cbe929e7d1447df8d8de575dc6ba2');
const KB_USE_CORS_PROXY = true;
const KB_CORS_PROXY_PREFIX = 'https://corsproxy.io/?';

async function kbRpc(method, params) {
    const url = KB_USE_CORS_PROXY ? (KB_CORS_PROXY_PREFIX + encodeURIComponent(KB_BASE_URL)) : KB_BASE_URL;
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': KB_AUTH
    };
    const payload = { jsonrpc: '2.0', method, id: Date.now(), params };
    const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(payload) });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error((data.error.message || 'RPC error') + (data.error.data ? ' - ' + JSON.stringify(data.error.data) : ''));
    return data.result;
}

async function kbGetTask(taskId) {
    return kbRpc('getTask', { task_id: Number(taskId) });
}

async function kbMoveTask({ project_id, task_id, column_id, position, swimlane_id }) {
    return kbRpc('moveTaskPosition', { project_id, task_id, column_id, position, swimlane_id });
}

// Password management functions (using Firebase)
let userPasswordsCache = {};
let passwordsLoaded = false;

function loadUserPasswords() {
    const passwordsRef = ref(database, 'userPasswords');
    onValue(passwordsRef, (snapshot) => {
        if (snapshot.exists()) {
            userPasswordsCache = snapshot.val();
        } else {
            userPasswordsCache = {};
        }
        passwordsLoaded = true;
        
        // Update UI after passwords are loaded
        const selectedUser = personSelect.value;
        if (selectedUser && hasUserPassword(selectedUser)) {
            passwordSection.style.display = 'block';
            passwordStatus.style.color = '#6b7280';
            passwordStatus.textContent = 'This user has a password set. Please enter it to continue.';
        }
    }, (error) => {
        console.error('Error loading passwords:', error);
        passwordsLoaded = true; // Still mark as loaded to prevent infinite loading
    });
}

function getUserPassword(user) {
    return userPasswordsCache[user] || null;
}

function setUserPassword(user, password) {
    const passwordsRef = ref(database, 'userPasswords');
    
    if (password) {
        // Set password in Firebase
        set(ref(database, `userPasswords/${user}`), password).then(() => {
            userPasswordsCache[user] = password;
        }).catch(err => {
            console.error('Error setting password:', err);
        });
    } else {
        // Remove password from Firebase
        remove(ref(database, `userPasswords/${user}`)).then(() => {
            delete userPasswordsCache[user];
        }).catch(err => {
            console.error('Error removing password:', err);
        });
    }
}

function hasUserPassword(user) {
    if (!passwordsLoaded) return false; // Don't show password prompt until loaded
    return getUserPassword(user) !== null;
}

// Filter functions
function initializeFilters() {
    const toggleBtn = document.getElementById('toggleFiltersBtn');
    const filterOptions = document.getElementById('filterOptions');
    const applyBtn = document.getElementById('applyFiltersBtn');
    const clearBtn = document.getElementById('clearFiltersBtn');
    
    // Toggle filter options visibility
    if (toggleBtn && filterOptions) {
        toggleBtn.addEventListener('click', () => {
            const isVisible = filterOptions.style.display !== 'none';
            filterOptions.style.display = isVisible ? 'none' : 'block';
            toggleBtn.textContent = isVisible ? '▼' : '▲';
        });
    }
    
    // Apply filters
    if (applyBtn) {
        applyBtn.addEventListener('click', () => {
            updateFiltersFromInputs();
            if (selectedPerson) {
                renderJobsForPerson(selectedPerson);
            }
        });
    }
    
    // Clear filters
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            clearAllFilters();
            if (selectedPerson) {
                renderJobsForPerson(selectedPerson);
            }
        });
    }
}

function updateFiltersFromInputs() {
    currentFilters.dateFrom = document.getElementById('dateFromFilter')?.value || '';
    currentFilters.dateTo = document.getElementById('dateToFilter')?.value || '';
    currentFilters.minTotal = document.getElementById('minTotalFilter')?.value || '';
    currentFilters.maxTotal = document.getElementById('maxTotalFilter')?.value || '';
    currentFilters.productType = document.getElementById('productTypeFilter')?.value || '';
    currentFilters.paymentStatus = document.getElementById('paymentStatusFilter')?.value || '';
    currentFilters.jobStatus = document.getElementById('jobStatusFilter')?.value || '';
    currentFilters.sortBy = document.getElementById('sortByFilter')?.value || 'date-desc';
}

function clearAllFilters() {
    currentFilters = {
        dateFrom: '',
        dateTo: '',
        minTotal: '',
        maxTotal: '',
        productType: '',
        paymentStatus: '',
        jobStatus: '',
        sortBy: 'date-desc'
    };
    
    // Clear UI inputs
    const inputs = ['dateFromFilter', 'dateToFilter', 'minTotalFilter', 'maxTotalFilter', 'productTypeFilter', 'paymentStatusFilter', 'jobStatusFilter', 'sortByFilter'];
    inputs.forEach(id => {
        const element = document.getElementById(id);
        if (element) {
            if (element.type === 'select-one') {
                element.value = id === 'sortByFilter' ? 'date-desc' : '';
            } else {
                element.value = '';
            }
        }
    });
}

function applyFiltersToJobs(jobs) {
    let filteredJobs = [...jobs];
    
    // Date range filter
    if (currentFilters.dateFrom) {
        const fromDate = new Date(currentFilters.dateFrom);
        filteredJobs = filteredJobs.filter(job => {
            if (!job.date) return false;
            const jobDate = new Date(job.date);
            return jobDate >= fromDate;
        });
    }
    
    if (currentFilters.dateTo) {
        const toDate = new Date(currentFilters.dateTo);
        toDate.setHours(23, 59, 59, 999); // Include the entire day
        filteredJobs = filteredJobs.filter(job => {
            if (!job.date) return false;
            const jobDate = new Date(job.date);
            return jobDate <= toDate;
        });
    }
    
    // Job total range filter
    if (currentFilters.minTotal) {
        const minTotal = parseFloat(currentFilters.minTotal);
        filteredJobs = filteredJobs.filter(job => {
            const total = parseFloat(job.jobTotal) || 0;
            return total >= minTotal;
        });
    }
    
    if (currentFilters.maxTotal) {
        const maxTotal = parseFloat(currentFilters.maxTotal);
        filteredJobs = filteredJobs.filter(job => {
            const total = parseFloat(job.jobTotal) || 0;
            return total <= maxTotal;
        });
    }
    
    // Product type filter
    if (currentFilters.productType) {
        filteredJobs = filteredJobs.filter(job => {
            switch (currentFilters.productType) {
                case 'stickers':
                    return job.stickers && job.stickers.length > 0;
                case 'banners':
                    return job.banner_canvas && job.banner_canvas.length > 0;
                case 'boards':
                    return job.boards && job.boards.length > 0;
                case 'other':
                    return job.other && job.other.length > 0;
                default:
                    return true;
            }
        });
    }
    
    // Payment status filter
    if (currentFilters.paymentStatus) {
        filteredJobs = filteredJobs.filter(job => {
            const total = parseFloat(job.jobTotal) || 0;
            const deposit = parseFloat(job.deposit) || 0;
            const balance = parseFloat(job.balanceDue) || 0;
            
            switch (currentFilters.paymentStatus) {
                case 'paid':
                    return balance === 0 && deposit > 0;
                case 'partial':
                    return deposit > 0 && balance > 0;
                case 'unpaid':
                    return deposit === 0;
                default:
                    return true;
            }
        });
    }
    
    // Job status filter (overdue/recent)
    if (currentFilters.jobStatus) {
        filteredJobs = filteredJobs.filter(job => {
            switch (currentFilters.jobStatus) {
                case 'overdue':
                    return isJobOverdue(job);
                case 'recent':
                    return !isJobOverdue(job);
                default:
                    return true;
            }
        });
    }
    
    // Sort jobs
    filteredJobs.sort((a, b) => {
        switch (currentFilters.sortBy) {
            case 'date-asc':
                return new Date(a.date || 0) - new Date(b.date || 0);
            case 'date-desc':
                return new Date(b.date || 0) - new Date(a.date || 0);
            case 'customer-asc':
                return (a.customerName || '').localeCompare(b.customerName || '');
            case 'customer-desc':
                return (b.customerName || '').localeCompare(a.customerName || '');
            case 'total-asc':
                return (parseFloat(a.jobTotal) || 0) - (parseFloat(b.jobTotal) || 0);
            case 'total-desc':
                return (parseFloat(b.jobTotal) || 0) - (parseFloat(a.jobTotal) || 0);
            default:
                return 0;
        }
    });
    
    return filteredJobs;
}

// Function to check if a job is overdue (older than 3 days)
function isJobOverdue(job) {
    if (!job.date) return false;
    const jobDate = new Date(job.date);
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    return jobDate < threeDaysAgo;
}

// Function to get days overdue for a job
function getDaysOverdue(job) {
    if (!job.date) return 0;
    const jobDate = new Date(job.date);
    const today = new Date();
    const diffTime = today - jobDate;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return Math.max(0, diffDays - 3); // Only return days beyond the 3-day threshold
}

// Function to check if a client has any overdue jobs
function clientHasOverdueJobs(jobs) {
    return jobs.some(job => isJobOverdue(job));
}

function populatePersonSelect(people) {
    personSelect.innerHTML = '<option value="">-- Select Person --</option>';
    allowedPeople.forEach(person => {
        const option = document.createElement('option');
        option.value = person;
        option.textContent = person;
        personSelect.appendChild(option);
    });
}

// Handle person selection and password checking
personSelect.addEventListener('change', () => {
    const selectedUser = personSelect.value;
    passwordStatus.textContent = '';
    userPasswordInput.value = '';
    
    if (!passwordsLoaded) {
        passwordStatus.style.color = '#3b82f6';
        passwordStatus.textContent = 'Loading user settings...';
        passwordSection.style.display = 'none';
        return;
    }
    
    if (selectedUser && hasUserPassword(selectedUser)) {
        passwordSection.style.display = 'block';
        userPasswordInput.focus();
        passwordStatus.style.color = '#6b7280';
        passwordStatus.textContent = 'This user has a password set. Please enter it to continue.';
    } else {
        passwordSection.style.display = 'none';
    }
});

// Password modal event listeners
setPasswordBtn.addEventListener('click', () => {
    const selectedUser = personSelect.value;
    if (!selectedUser) {
        alert('Please select a person first.');
        return;
    }
    
    setPasswordUser.textContent = `Setting password for: ${selectedUser}`;
    newPasswordInput.value = '';
    confirmPasswordInput.value = '';
    setPasswordStatus.textContent = '';
    
    // Check if user already has a password
    const hasExistingPassword = getUserPassword(selectedUser) !== null;
    const oldPasswordField = document.getElementById('oldPasswordField');
    const oldPasswordInput = document.getElementById('oldPasswordInput');
    
    if (hasExistingPassword) {
        // Show old password field
        if (oldPasswordField) oldPasswordField.style.display = 'block';
        if (oldPasswordInput) oldPasswordInput.value = '';
        setPasswordStatus.style.color = '#6b7280';
        setPasswordStatus.textContent = 'Enter your current password to change it.';
    } else {
        // Hide old password field
        if (oldPasswordField) oldPasswordField.style.display = 'none';
        setPasswordStatus.textContent = '';
    }
    
    setPasswordModal.style.display = 'flex';
    
    if (hasExistingPassword && oldPasswordInput) {
        oldPasswordInput.focus();
    } else {
        newPasswordInput.focus();
    }
});

savePasswordBtn.addEventListener('click', () => {
    const selectedUser = personSelect.value;
    const newPassword = newPasswordInput.value.trim();
    const confirmPassword = confirmPasswordInput.value.trim();
    
    if (!newPassword) {
        setPasswordStatus.textContent = 'Password cannot be empty.';
        return;
    }
    
    if (newPassword !== confirmPassword) {
        setPasswordStatus.textContent = 'Passwords do not match.';
        return;
    }
    
    if (newPassword.length < 4) {
        setPasswordStatus.textContent = 'Password must be at least 4 characters long.';
        return;
    }
    
    // Check if user already has a password - if so, require old password
    const existingPassword = getUserPassword(selectedUser);
    if (existingPassword) {
        const oldPasswordInput = document.getElementById('oldPasswordInput');
        const enteredOldPassword = oldPasswordInput ? oldPasswordInput.value.trim() : '';
        
        if (!enteredOldPassword) {
            setPasswordStatus.style.color = '#ef4444';
            setPasswordStatus.textContent = 'Please enter your current password first.';
            if (oldPasswordInput) oldPasswordInput.focus();
            return;
        }
        
        if (enteredOldPassword !== existingPassword) {
            setPasswordStatus.style.color = '#ef4444';
            setPasswordStatus.textContent = 'Current password is incorrect.';
            if (oldPasswordInput) {
                oldPasswordInput.value = '';
                oldPasswordInput.focus();
            }
            return;
        }
    }
    
    // Show loading state
    setPasswordStatus.style.color = '#3b82f6';
    setPasswordStatus.textContent = 'Saving password...';
    
    // Set password in Firebase
    set(ref(database, `userPasswords/${selectedUser}`), newPassword)
        .then(() => {
            userPasswordsCache[selectedUser] = newPassword;
            setPasswordStatus.style.color = '#10b981';
            setPasswordStatus.textContent = 'Password saved successfully!';
            
            setTimeout(() => {
                setPasswordModal.style.display = 'none';
                // Show password section if user now has a password
                if (hasUserPassword(selectedUser)) {
                    passwordSection.style.display = 'block';
                }
            }, 1500);
        })
        .catch((error) => {
            setPasswordStatus.style.color = '#ef4444';
            setPasswordStatus.textContent = 'Error saving password: ' + error.message;
        });
});

removePasswordBtn.addEventListener('click', () => {
    const selectedUser = personSelect.value;
    
    // Show loading state
    setPasswordStatus.style.color = '#3b82f6';
    setPasswordStatus.textContent = 'Removing password...';
    
    // Remove password from Firebase
    remove(ref(database, `userPasswords/${selectedUser}`))
        .then(() => {
            delete userPasswordsCache[selectedUser];
            setPasswordStatus.style.color = '#10b981';
            setPasswordStatus.textContent = 'Password removed successfully!';
            
            setTimeout(() => {
                setPasswordModal.style.display = 'none';
                passwordSection.style.display = 'none';
            }, 1500);
        })
        .catch((error) => {
            setPasswordStatus.style.color = '#ef4444';
            setPasswordStatus.textContent = 'Error removing password: ' + error.message;
        });
});

cancelPasswordBtn.addEventListener('click', () => {
    setPasswordModal.style.display = 'none';
});

// Close password modal when clicking outside
setPasswordModal.addEventListener('click', (e) => {
    if (e.target === setPasswordModal) {
        setPasswordModal.style.display = 'none';
    }
});

// Allow Enter key to submit password
userPasswordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        selectPersonBtn.click();
    }
});

// Allow Enter key in password setup
const oldPasswordInput = document.getElementById('oldPasswordInput');
if (oldPasswordInput) {
    oldPasswordInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            newPasswordInput.focus();
        }
    });
}

newPasswordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        confirmPasswordInput.focus();
    }
});

confirmPasswordInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        savePasswordBtn.click();
    }
});

function showPersonModal() {
    personModal.style.display = 'flex';
    changePersonBtn.style.display = 'none';
    const currentUserDisplay = document.getElementById('currentUserDisplay');
    if (currentUserDisplay) currentUserDisplay.textContent = '';
    
    // Reset password fields
    passwordSection.style.display = 'none';
    userPasswordInput.value = '';
    passwordStatus.textContent = '';
    personSelect.value = '';
}

function hidePersonModal() {
    personModal.style.display = 'none';
    changePersonBtn.style.display = 'inline-block';
    
    // Clear password fields
    userPasswordInput.value = '';
    passwordStatus.textContent = '';
    passwordSection.style.display = 'none';
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
    
    // Check if passwords are still loading
    if (!passwordsLoaded) {
        passwordStatus.style.color = '#f59e0b';
        passwordStatus.textContent = 'Please wait while user settings load...';
        return;
    }
    
    // Check if user has a password
    if (hasUserPassword(person)) {
        const enteredPassword = userPasswordInput.value.trim();
        const storedPassword = getUserPassword(person);
        
        if (!enteredPassword) {
            passwordStatus.style.color = '#ef4444';
            passwordStatus.textContent = 'Please enter your password.';
            userPasswordInput.focus();
            return;
        }
        
        if (enteredPassword !== storedPassword) {
            passwordStatus.style.color = '#ef4444';
            passwordStatus.textContent = 'Incorrect password. Please try again.';
            userPasswordInput.value = '';
            userPasswordInput.focus();
            return;
        }
    }
    
    // Clear any error messages
    passwordStatus.textContent = '';
    
    selectedPerson = person;
    hidePersonModal();
    
    // Check and show welcome back message
    checkAndShowWelcomeBack(person);
    
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
loadUserPasswords(); // Load passwords from Firebase
initializeFilters();

// Clean up old done jobs every 30 minutes
setInterval(() => {
    cleanOldDoneJobs();
}, 30 * 60 * 1000); // 30 minutes

// Auto-refresh client list every 3 seconds
setInterval(() => {
    if (selectedPerson && !isManualUpdate) {
        // Refresh allJobs from Firebase
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
            }
            // Re-render the filtered jobs for the selected person
            let jobs = allJobs.filter(job => job.assignedTo === selectedPerson && !isJobInRecycle(job) && !isJobDone(job));
            // Apply filters
            jobs = applyFiltersToJobs(jobs);
            
            if (jobs.length === 0) {
                if (statusDiv) statusDiv.textContent = `No jobs found for ${selectedPerson} with current filters.`;
                return;
            }
            if (statusDiv) statusDiv.textContent = '';
            const clientMap = groupJobsByClient(jobs);
            renderFilteredClientList(clientMap);
        }, (error) => {
            console.error('Auto-refresh error:', error);
        });
    }
}, 3000);

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

function getDoneJobs() {
    let doneJobs = localStorage.getItem('doneJobs');
    if (!doneJobs) return [];
    try { return JSON.parse(doneJobs); } catch { return []; }
}
function setDoneJobs(arr) {
    localStorage.setItem('doneJobs', JSON.stringify(arr));
}
function isJobDone(job) {
    const doneJobs = getDoneJobs();
    return doneJobs.some(d => d.jobId === job._key);
}
function markJobAsDone(job) {
    const doneJobs = getDoneJobs();
    // Check if already marked as done
    if (!doneJobs.some(d => d.jobId === job._key)) {
        doneJobs.push({
            jobId: job._key,
            job,
            completedOn: Date.now()
        });
        setDoneJobs(doneJobs);
    }
}
function markJobAsUndone(jobId) {
    let doneJobs = getDoneJobs();
    doneJobs = doneJobs.filter(d => d.jobId !== jobId);
    setDoneJobs(doneJobs);
}
function cleanOldDoneJobs() {
    let doneJobs = getDoneJobs();
    const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000; // 5 hours in milliseconds
    
    // Find jobs that were completed more than 5 hours ago
    const toMove = doneJobs.filter(d => d.completedOn < fiveHoursAgo);
    
    // These jobs are automatically moved to a permanent "completed" state
    // For now, they stay in the done jobs list but we could implement a separate archive
    
    return doneJobs; // Return all for now, can be modified later for archiving
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

// Add event listeners for done jobs modal
const openDoneJobsBtn = document.getElementById('openDoneJobsBtn');
const doneJobsModal = document.getElementById('doneJobsModal');
const closeDoneJobsBtn = document.getElementById('closeDoneJobsBtn');
openDoneJobsBtn.addEventListener('click', () => {
    renderDoneJobs();
    doneJobsModal.style.display = 'flex';
});
closeDoneJobsBtn.addEventListener('click', () => {
    doneJobsModal.style.display = 'none';
});

document.body.addEventListener('click', function(e) {
    if (e.target === recycleBinModal) {
        recycleBinModal.style.display = 'none';
    }
    if (e.target === doneJobsModal) {
        doneJobsModal.style.display = 'none';
    }
});

function renderRecycleBin() {
    cleanOldRecycleBin();
    const recycle = getRecycleBin();
    const recycleTable = document.getElementById('recycleTable');
    const recycleStatus = document.getElementById('recycleStatus');
    const tbody = recycleTable.querySelector('tbody');
    tbody.innerHTML = '';
    
    // Filter recycle bin to show only jobs for the currently selected user
    const userRecycle = selectedPerson ? recycle.filter(j => j.job && j.job.assignedTo === selectedPerson) : [];
    
    if (userRecycle.length === 0) {
        recycleTable.style.display = 'none';
        recycleStatus.textContent = selectedPerson ? `No deleted jobs found for ${selectedPerson}.` : 'Please select a user to view their deleted jobs.';
        return;
    }
    recycleTable.style.display = '';
    recycleStatus.textContent = '';
    userRecycle.forEach(j => {
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

function renderDoneJobs() {
    cleanOldDoneJobs();
    const doneJobs = getDoneJobs();
    const doneJobsTable = document.getElementById('doneJobsTable');
    const doneJobsStatus = document.getElementById('doneJobsStatus');
    const tbody = doneJobsTable.querySelector('tbody');
    tbody.innerHTML = '';
    
    // Filter done jobs to show only jobs for the currently selected user
    const userDoneJobs = selectedPerson ? doneJobs.filter(d => d.job && d.job.assignedTo === selectedPerson) : [];
    
    if (userDoneJobs.length === 0) {
        doneJobsTable.style.display = 'none';
        doneJobsStatus.textContent = selectedPerson ? `No completed jobs found for ${selectedPerson}.` : 'Please select a user to view their completed jobs.';
        return;
    }
    doneJobsTable.style.display = '';
    doneJobsStatus.textContent = '';
    
    // Sort by completion time (most recent first)
    userDoneJobs.sort((a, b) => b.completedOn - a.completedOn);
    
    userDoneJobs.forEach(d => {
        const fiveHoursAgo = Date.now() - 5 * 60 * 60 * 1000;
        const canMarkUndone = d.completedOn > fiveHoursAgo;
        const timeAgo = Math.floor((Date.now() - d.completedOn) / (60 * 60 * 1000)); // hours ago
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${safeField(d.job.customerName)}</td>
            <td>${safeField(d.job.date)}</td>
            <td>${safeField(d.job.customerCell)}</td>
            <td>${safeField((d.job.jobDescription || '').slice(0,40) + ((d.job.jobDescription||'').length>40?'...':''))}</td>
            <td>${safeField(d.job.assignedTo)}</td>
            <td>${new Date(d.completedOn).toLocaleString()} (${timeAgo}h ago)</td>
            <td>
                ${canMarkUndone ? `<button class="mark-undone-btn" data-jobid="${d.jobId}">Mark as Undone</button>` : '<span style="color:#888;">Auto-archived (>5h)</span>'}
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    // Add event listeners for undone buttons
    document.querySelectorAll('.mark-undone-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const jobId = e.target.dataset.jobid;
            markJobAsUndone(jobId);
            const doneJobs = getDoneJobs();
            const entry = doneJobs.find(d => d.jobId === jobId);
            writeLog({user: entry && entry.job ? entry.job.assignedTo : '—', action: 'marked as undone', jobName: entry && entry.job ? entry.job.customerName : jobId});
            renderClientList();
            renderDoneJobs();
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
    const clientMap = groupJobsByClient(allJobs.filter(job => !isJobInRecycle(job) && !isJobDone(job)));
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
        const isOverdue = isJobOverdue(job);
        const daysOverdue = getDaysOverdue(job);
        
        // Add overdue warning to job header if applicable
        let jobHeader = `Job #${idx + 1}`;
        if (isOverdue) {
            jobHeader += ` <span class="overdue-warning overdue-tooltip" data-tooltip="This job is ${daysOverdue} day${daysOverdue > 1 ? 's' : ''} overdue" style="font-size:0.7rem;margin-left:8px;">
                <svg class="overdue-warning-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                </svg>
                ${daysOverdue}d overdue
            </span>`;
        }
        
        html += `<div class='a4-job-details' ${isOverdue ? 'style="border-left: 4px solid #dc2626;"' : ''}>
            <h3>${jobHeader}</h3>
            <table>
                <tr><th>Date</th><td>${safeField(job.date)}${isOverdue ? ' <span style="color:#dc2626;font-weight:600;">(OVERDUE)</span>' : ''}</td></tr>
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
                ${job.apiTaskId ? `<tr><th>API Task ID</th><td>${job.apiTaskId}</td></tr>` : ''}
            </table>
            ${job.apiTaskId ? `
            <div class='kb-section' id='kb-${jobId}' style='margin-top:10px;padding:10px;border:1px dashed #cbd5e1;border-radius:8px;'>
                <div style='font-weight:600;color:#374151;margin-bottom:6px;'>Move to</div>
                <div class='kb-move-grid' style='display:flex;flex-wrap:wrap;gap:6px;'>
                    <button class='kb-move-col-btn' data-jobid='${jobId}' data-col='1' style='background:#7C3AED;color:#fff;border:none;padding:8px 10px;border-radius:6px;cursor:pointer;'>backlog</button>
                    <button class='kb-move-col-btn' data-jobid='${jobId}' data-col='2' style='background:#7C3AED;color:#fff;border:none;padding:8px 10px;border-radius:6px;cursor:pointer;'>new</button>
                    <button class='kb-move-col-btn' data-jobid='${jobId}' data-col='5' style='background:#7C3AED;color:#fff;border:none;padding:8px 10px;border-radius:6px;cursor:pointer;'>pending action</button>
                    <button class='kb-move-col-btn' data-jobid='${jobId}' data-col='3' style='background:#7C3AED;color:#fff;border:none;padding:8px 10px;border-radius:6px;cursor:pointer;'>design</button>
                    <button class='kb-move-col-btn' data-jobid='${jobId}' data-col='8' style='background:#7C3AED;color:#fff;border:none;padding:8px 10px;border-radius:6px;cursor:pointer;'>queue for printing</button>
                    <button class='kb-move-col-btn' data-jobid='${jobId}' data-col='6' style='background:#7C3AED;color:#fff;border:none;padding:8px 10px;border-radius:6px;cursor:pointer;'>printing</button>
                    <button class='kb-move-col-btn' data-jobid='${jobId}' data-col='7' style='background:#7C3AED;color:#fff;border:none;padding:8px 10px;border-radius:6px;cursor:pointer;'>factory</button>
                    <button class='kb-move-col-btn' data-jobid='${jobId}' data-col='4' style='background:#7C3AED;color:#fff;border:none;padding:8px 10px;border-radius:6px;cursor:pointer;'>done</button>
                </div>
            </div>
            ` : ''}
            <button class='edit-job-btn' data-jobid='${jobId}' style='margin-top:12px;background:#7c3aed;color:#fff;border:none;padding:10px 22px;border-radius:7px;font-size:1rem;cursor:pointer;margin-right:10px;'>Edit</button>
            <button class='send-along-btn' data-jobid='${jobId}' style='margin-top:12px;background:#38bdf8;color:#fff;border:none;padding:10px 22px;border-radius:7px;font-size:1rem;cursor:pointer;margin-right:10px;'>Send It Along</button>
            <button class='save-pdf-btn' data-jobid='${jobId}' style='margin-top:12px;background:#10b981;color:#fff;border:none;padding:10px 22px;border-radius:7px;font-size:1rem;cursor:pointer;margin-right:10px;'>Save as PDF</button>
            <button class='mark-done-btn' data-jobid='${jobId}' style='margin-top:12px;background:#10b981;color:#fff;border:none;padding:10px 22px;border-radius:7px;font-size:1rem;cursor:pointer;margin-right:10px;'>Mark as Done</button>
            <button class='delete-job-btn' data-jobid='${jobId}' style='margin-top:12px;background:#b23c3c;color:#fff;border:none;padding:10px 22px;border-radius:7px;font-size:1rem;cursor:pointer;'>Delete Job</button>
        </div>`;
    });
    clientModalContent.innerHTML = html;
    clientModal.style.display = 'flex';

    // Initialize Kanboard sections for jobs that have API Task IDs
    jobs.forEach(job => {
        if (job.apiTaskId) initKanboardSection(job);
    });
}

document.body.addEventListener('click', function(e) {
    if (e.target.classList.contains('close-modal-btn')) {
        if (e.target.id === 'closeEditJobModalBtn') {
            document.getElementById('editJobModal').style.display = 'none';
            document.getElementById('editJobStatus').textContent = '';
        } else if (e.target.id === 'closeSendAlongModalBtn') {
            document.getElementById('sendAlongModal').style.display = 'none';
            document.getElementById('sendAlongStatus').textContent = '';
        } else {
            clientModal.style.display = 'none';
        }
    }
    if (e.target === clientModal) {
        clientModal.style.display = 'none';
    }
    if (e.target.classList.contains('edit-job-btn')) {
        const jobId = e.target.dataset.jobid;
        const job = allJobs.find(j => j._key === jobId);
        if (!job) return;
        openEditJobModal(job);
    }
    if (e.target.classList.contains('send-along-btn')) {
        const jobId = e.target.dataset.jobid;
        const job = allJobs.find(j => j._key === jobId);
        if (!job) return;
        openSendAlongModal(job);
    }
    if (e.target.classList.contains('save-pdf-btn')) {
        const jobId = e.target.dataset.jobid;
        const job = allJobs.find(j => j._key === jobId);
        if (!job) return;
        generatePDF(job);
    }
    if (e.target.classList.contains('mark-done-btn')) {
        const jobId = e.target.dataset.jobid;
        const job = allJobs.find(j => j._key === jobId);
        if (!job) return;
        markJobAsDone(job);
        clientModal.style.display = 'none';
        writeLog({user: job.assignedTo, action: 'marked as done', jobName: job.customerName});
        renderClientList();
        cleanOldDoneJobs(); // Clean up old done jobs when adding new ones
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

    // Kanboard move: column button
    if (e.target.classList.contains('kb-move-col-btn')) {
        const jobId = e.target.dataset.jobid;
        const job = allJobs.find(j => j._key === jobId);
        if (!job || !job.apiTaskId) return;
        const section = document.getElementById(`kb-${jobId}`);
        if (!section) return;
        // Ensure task snapshot exists; if missing, (re)load first then move
        const doMove = async () => {
            const column_id = Number(e.target.dataset.col);
            await handleKanboardMove(job, column_id);
        };
        if (!section.dataset.projectId || !section.dataset.swimlaneId) {
            initKanboardSection(job, true).then(doMove).catch(doMove);
        } else {
            doMove();
        }
    }
});

function openEditJobModal(job) {
    const modal = document.getElementById('editJobModal');
    const form = document.getElementById('editJobForm');
    const status = document.getElementById('editJobStatus');
    status.textContent = '';
    // Build form fields
    form.innerHTML = `
        <label>Date:<br><input type="date" name="date" value="${job.date || ''}" required></label><br>
        <label>Customer Name:<br><input type="text" name="customerName" value="${job.customerName || ''}" required></label><br>
        <label>Customer Cell Number:<br><input type="text" name="customerCell" value="${job.customerCell || ''}" required></label><br>
        <label>Email:<br><input type="email" name="email" value="${job.email || ''}"></label><br>
        <label>Job Total:<br><input type="number" step="0.01" name="jobTotal" value="${job.jobTotal || ''}"></label><br>
        <label>Deposit:<br><input type="number" step="0.01" name="deposit" value="${job.deposit || ''}"></label><br>
        <label>Balance Due:<br><input type="number" step="0.01" name="balanceDue" value="${job.balanceDue || ''}"></label><br>
        <label>Stickers:<br><input type="text" name="stickers" value="${Array.isArray(job.stickers) ? job.stickers.join(', ') : (job.stickers || '')}"></label><br>
        <label>Other:<br><input type="text" name="other" value="${Array.isArray(job.other) ? job.other.join(', ') : (job.other || '')}"></label><br>
        <label>Banner/Canvas:<br><input type="text" name="banner_canvas" value="${Array.isArray(job.banner_canvas) ? job.banner_canvas.join(', ') : (job.banner_canvas || '')}"></label><br>
        <label>Boards:<br><input type="text" name="boards" value="${Array.isArray(job.boards) ? job.boards.join(', ') : (job.boards || '')}"></label><br>
        <label>Description:<br><textarea name="jobDescription" rows="3">${job.jobDescription || ''}</textarea></label><br>
        <label>Assigned To:<br><input type="text" name="assignedTo" value="${job.assignedTo || ''}"></label><br>
        <button type="submit" class="btn" style="margin-top:10px;">Save Changes</button>
    `;
    form.onsubmit = function(ev) {
        ev.preventDefault();
        const formData = new FormData(form);
        const updatedJob = {
            ...job,
            date: formData.get('date'),
            customerName: formData.get('customerName'),
            customerCell: formData.get('customerCell'),
            email: formData.get('email'),
            jobTotal: formData.get('jobTotal'),
            deposit: formData.get('deposit'),
            balanceDue: formData.get('balanceDue'),
            stickers: formData.get('stickers') ? formData.get('stickers').split(',').map(s => s.trim()).filter(Boolean) : [],
            other: formData.get('other') ? formData.get('other').split(',').map(s => s.trim()).filter(Boolean) : [],
            banner_canvas: formData.get('banner_canvas') ? formData.get('banner_canvas').split(',').map(s => s.trim()).filter(Boolean) : [],
            boards: formData.get('boards') ? formData.get('boards').split(',').map(s => s.trim()).filter(Boolean) : [],
            jobDescription: formData.get('jobDescription'),
            assignedTo: formData.get('assignedTo'),
        };
        // Save to Firebase
        set(ref(database, 'jobCards/' + job._key), updatedJob)
            .then(() => {
                status.style.color = '#7c3aed';
                status.textContent = 'Job card updated!';
                setTimeout(() => {
                    modal.style.display = 'none';
                    status.textContent = '';
                    renderClientList();
                }, 1200);
                writeLog({user: updatedJob.assignedTo, action: 'edited', jobName: updatedJob.customerName});
            })
            .catch((err) => {
                status.style.color = '#e11d48';
                status.textContent = 'Error: ' + err.message;
            });
    };
    modal.style.display = 'flex';
}

function openSendAlongModal(job) {
    const modal = document.getElementById('sendAlongModal');
    const form = document.getElementById('sendAlongForm');
    const status = document.getElementById('sendAlongStatus');
    const userSelect = document.getElementById('sendAlongUser');
    status.textContent = '';
    // Populate user list, excluding current assignedTo
    userSelect.innerHTML = '';
    allowedPeople.filter(p => p !== job.assignedTo).forEach(person => {
        const opt = document.createElement('option');
        opt.value = person;
        opt.textContent = person;
        userSelect.appendChild(opt);
    });
    form.onsubmit = function(ev) {
        ev.preventDefault();
        const newUser = userSelect.value;
        if (!newUser) {
            status.textContent = 'Please select a user.';
            return;
        }
        // Update job in Firebase
        const updatedJob = {...job, assignedTo: newUser};
        set(ref(database, 'jobCards/' + job._key), updatedJob)
            .then(() => {
                status.style.color = '#38bdf8';
                status.textContent = 'Job sent along!';
                // Show popup notification
                showPopupNotification(`Job sent to ${newUser}!`, 'success', 4000);
                // Set manual update flag to prevent auto-refresh interference
                isManualUpdate = true;
                // Instantly update UI: close modal, remove job from allJobs, return to client list, and refresh
                modal.style.display = 'none';
                status.textContent = '';
                clientModal.style.display = 'none';
                // Remove job from allJobs in memory
                allJobs = allJobs.filter(j => j._key !== job._key);
                renderClientList();
                writeLog({user: newUser, action: 'sent along', jobName: job.customerName, details: `from ${job.assignedTo}`});
                // Clear manual update flag after 5 seconds to allow auto-refresh to resume
                setTimeout(() => {
                    isManualUpdate = false;
                }, 5000);
            })
            .catch((err) => {
                status.style.color = '#e11d48';
                status.textContent = 'Error: ' + err.message;
            });
    };
    modal.style.display = 'flex';
}

function generatePDF(job) {
    const jsPDFLib = window.jspdf && window.jspdf.jsPDF ? window.jspdf.jsPDF : null;
    if (!jsPDFLib) {
        alert('PDF library not loaded. Please check your internet connection or try again.');
        return;
    }
    const doc = new jsPDFLib();

    // Professional header with light grey background
    doc.setFillColor(128, 128, 128);
    doc.rect(0, 0, 210, 40, 'F');
    
    // White text on grey background
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    doc.text('JOB CARD', 105, 20, { align: 'center' });
    
    doc.setFontSize(16);
    doc.text(job.customerName || 'Customer', 105, 32, { align: 'center' });

    // Reset text color for content
    doc.setTextColor(0, 0, 0);
    
    // Add lines for manual entry at the top left and top right
    doc.setFontSize(14);
    doc.setTextColor(80, 80, 80);
    // Top left
    doc.text('Invoice NO: ___________', 20, 45, { align: 'left' });
    doc.text('Quote NO: ____________', 20, 52, { align: 'left' });
    // Top right
    doc.text('Order Number: __________', 150, 45, { align: 'left' });
    doc.text(`Jobcard No: ${job.apiTaskId || '___________'}`, 150, 52, { align: 'left' });

    // Add job details in the specified order with professional styling (excluding description)
    doc.setFontSize(12);
    let y = 55;

    const details = [
        ['Customer Name', safeField(job.customerName)],
        ['Cell Number', safeField(job.customerCell)],
        ['Email', safeField(job.email)],
        ['Stickers', safeList(job.stickers)],
        ['Other', safeList(job.other)],
        ['Banner', safeList(job.banner_canvas)],
        ['Boards', safeList(job.boards)],
        ['Deposit', job.deposit ? formatRand(job.deposit) : '—'],
        ['Balance Due', job.balanceDue ? formatRand(job.balanceDue) : '—'],
        ['Job Total', job.jobTotal ? formatRand(job.jobTotal) : '—'],
        ['Assigned To', safeField(job.assignedTo)],
        ['Job Card Created', safeField(job.date)]
    ];

    // Add API Task ID to details if it exists
    if (job.apiTaskId) {
        details.push(['API Task ID', job.apiTaskId]);
    }

    doc.autoTable({
        startY: y,
        head: [['Field', 'Value']],
        body: details,
        theme: 'grid',
        headStyles: { 
            fillColor: [128, 128, 128],
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 12
        },
        bodyStyles: {
            fontSize: 11,
            lineColor: [200, 200, 200],
            lineWidth: 0.1,
            textColor: [80, 80, 80]
        },
        alternateRowStyles: {
            fillColor: [248, 249, 250]
        },
        margin: { top: 10, right: 20, bottom: 20, left: 20 },
        styles: {
            overflow: 'linebreak',
            cellWidth: 'auto'
        },
        columnStyles: {
            0: { cellWidth: 50, fontStyle: 'bold' },
            1: { cellWidth: 120 }
        }
    });

    // Add additional notes section at the bottom
    const finalY = doc.lastAutoTable.finalY || 180; // Get the Y position after the table
    let notesY = Math.max(finalY + 20, 180); // Start notes at least 20mm below table or at 180mm
    
    doc.setFontSize(14);
    doc.setTextColor(80, 80, 80);
    doc.setFont('helvetica', 'bold');
    doc.text('ADDITIONAL NOTES:', 20, notesY);
    
    // Add 5 lines for additional notes (avoid overlap with signature)
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(12);
    for (let i = 1; i <= 5; i++) {
        const lineY = notesY + (i * 8) + 5;
        doc.text(`${i}. _________________________________________________________________________________________________________________`, 20, lineY);
    }

    // Add footer
    const pageHeight = doc.internal.pageSize.height;
    doc.setFontSize(10);
    doc.setTextColor(80, 80, 80);
    doc.text('Generated on: ' + new Date().toLocaleDateString(), 20, pageHeight - 35);
    doc.text('Job Card System', 190, pageHeight - 35, { align: 'right' });

    // Add manual fill-in fields at the bottom left
    doc.setFontSize(12);
    doc.setTextColor(80, 80, 80);
    doc.text('Client Signature: __________', 20, pageHeight - 55);
    doc.text('Collection Date: ___________', 20, pageHeight - 48);

    // Add new page for job description if it exists
    if (job.jobDescription && job.jobDescription.trim()) {
        doc.addPage();
        
        // Header for description page
        doc.setFillColor(128, 128, 128);
        doc.rect(0, 0, 210, 30, 'F');
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(20);
        doc.setFont('helvetica', 'bold');
        doc.text('JOB DESCRIPTION', 105, 20, { align: 'center' });
        
        // Reset text color and add customer name
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text(`Customer: ${safeField(job.customerName)}`, 20, 45);
        
        // Add description content in a neat layout
        doc.setFontSize(12);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(60, 60, 60);
        
        // Split description into lines that fit the page width
        const descriptionText = safeField(job.jobDescription);
        const splitDescription = doc.splitTextToSize(descriptionText, 170); // 170mm width to leave margins
        
        // Add the description text starting from y position 60
        doc.text(splitDescription, 20, 60);
    }

    // Save the PDF directly
    const filename = `JobCard_${(job.customerName || '').replace(/\s+/g, '_')}_${job.date || ''}.pdf`;
    doc.save(filename);
}

function applyUserTheme(user) {
    const root = document.documentElement;
    
    switch(user) {
        case 'Neil':
            // Teal blue gradient
            root.style.setProperty('--primary-color', '#0ea5e9');
            root.style.setProperty('--secondary-color', '#0891b2');
            root.style.setProperty('--accent-color', '#06b6d4');
            root.style.setProperty('--gradient-start', '#0ea5e9');
            root.style.setProperty('--gradient-end', '#0891b2');
            root.style.setProperty('--primary-color-rgb', '14, 165, 233');
            break;
        case 'Yolandie':
            // Pink purple gradient
            root.style.setProperty('--primary-color', '#ec4899');
            root.style.setProperty('--secondary-color', '#a855f7');
            root.style.setProperty('--accent-color', '#c084fc');
            root.style.setProperty('--gradient-start', '#ec4899');
            root.style.setProperty('--gradient-end', '#a855f7');
            root.style.setProperty('--primary-color-rgb', '236, 72, 153');
            break;
        case 'Francois':
            // Green gradient
            root.style.setProperty('--primary-color', '#10b981');
            root.style.setProperty('--secondary-color', '#059669');
            root.style.setProperty('--accent-color', '#34d399');
            root.style.setProperty('--gradient-start', '#10b981');
            root.style.setProperty('--gradient-end', '#059669');
            root.style.setProperty('--primary-color-rgb', '16, 185, 129');
            break;
        case 'Andre':
            // Golden gradient
            root.style.setProperty('--primary-color', '#f59e0b');
            root.style.setProperty('--secondary-color', '#d97706');
            root.style.setProperty('--accent-color', '#fbbf24');
            root.style.setProperty('--gradient-start', '#f59e0b');
            root.style.setProperty('--gradient-end', '#d97706');
            root.style.setProperty('--primary-color-rgb', '245, 158, 11');
            break;
        default:
            // Default purple theme
            root.style.setProperty('--primary-color', '#7c3aed');
            root.style.setProperty('--secondary-color', '#38bdf8');
            root.style.setProperty('--accent-color', '#8b5cf6');
            root.style.setProperty('--gradient-start', '#7c3aed');
            root.style.setProperty('--gradient-end', '#38bdf8');
            root.style.setProperty('--primary-color-rgb', '124, 58, 237');
    }
    
    // Specifically target client buttons and ensure they use the correct theme
    const clientButtons = document.querySelectorAll('.client-list .client-name');
    clientButtons.forEach(btn => {
        btn.style.background = `linear-gradient(90deg, var(--gradient-start) 0%, var(--gradient-end) 100%)`;
        btn.style.color = '#fff';
        btn.style.boxShadow = `0 4px 15px rgba(var(--primary-color-rgb), 0.15)`;
    });
    
    // Apply theme to specific elements that might not use CSS variables
    const buttons = document.querySelectorAll('button, .btn, input[type="submit"]');
    buttons.forEach(btn => {
        if (btn.style.background && btn.style.background.includes('7c3aed')) {
            btn.style.background = `linear-gradient(90deg, var(--gradient-start) 0%, var(--gradient-end) 100%)`;
        }
    });
    
    // Update any inline styles that might be using purple
    const elementsWithPurple = document.querySelectorAll('[style*="7c3aed"], [style*="purple"]');
    elementsWithPurple.forEach(el => {
        const style = el.getAttribute('style');
        if (style) {
            el.setAttribute('style', style.replace(/#7c3aed/g, 'var(--primary-color)'));
        }
    });
}

function renderJobsForPerson(person) {
    // Apply user-specific theme
    applyUserTheme(person);
    
    // Show only jobs assigned to this person, grouped by client
    clientListDiv.innerHTML = '';
    const currentUserDisplay = document.getElementById('currentUserDisplay');
    if (currentUserDisplay) {
        currentUserDisplay.textContent = person ? person : '';
    }
    // Show search bar and filter when a user is selected
    const searchContainer = document.getElementById('searchContainer');
    const filterContainer = document.getElementById('filterContainer');
    if (searchContainer) {
        searchContainer.style.display = person ? 'block' : 'none';
    }
    if (filterContainer) {
        filterContainer.style.display = person ? 'block' : 'none';
    }
    
    // Refresh allJobs from Firebase to get latest changes
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
        }
        // Now render the filtered jobs for the selected person
        let jobs = allJobs.filter(job => job.assignedTo === person && !isJobInRecycle(job) && !isJobDone(job));
        
        // Apply filters
        jobs = applyFiltersToJobs(jobs);
        
        if (jobs.length === 0) {
            if (statusDiv) statusDiv.textContent = `No jobs found for ${person} with current filters.`;
            return;
        }
        if (statusDiv) statusDiv.textContent = '';
        const clientMap = groupJobsByClient(jobs);
        renderFilteredClientList(clientMap);
    }, (error) => {
        if (statusDiv) statusDiv.textContent = 'Error loading jobs: ' + error.message;
    });
}

function renderFilteredClientList(clientMap) {
    clientListDiv.innerHTML = '';
    const searchInput = document.getElementById('customerSearchInput');
    const searchTerm = searchInput ? searchInput.value.toLowerCase() : '';
    
    let totalFilteredClients = 0;
    
    for (const [client, jobs] of clientMap.entries()) {
        // Filter by search term
        if (searchTerm && !client.toLowerCase().includes(searchTerm)) {
            continue;
        }
        
        totalFilteredClients++;
        
        const btn = document.createElement('button');
        btn.className = 'client-name';
        
        // Check if this client has any overdue jobs
        const hasOverdueJobs = clientHasOverdueJobs(jobs);
        if (hasOverdueJobs) {
            btn.classList.add('has-overdue');
        }
        
        // Create button content with potential warning icon
        let buttonContent = `${client} (${jobs.length})`;
        
        if (hasOverdueJobs) {
            // Find the most overdue job for this client
            const overdueJobs = jobs.filter(job => isJobOverdue(job));
            const mostOverdueJob = overdueJobs.reduce((mostOverdue, job) => {
                const jobDays = getDaysOverdue(job);
                const mostOverdueDays = getDaysOverdue(mostOverdue);
                return jobDays > mostOverdueDays ? job : mostOverdue;
            }, overdueJobs[0]);
            
            const daysOverdue = getDaysOverdue(mostOverdueJob);
            const overdueCount = overdueJobs.length;
            
            // Add warning icon and text
            buttonContent += `<span class="overdue-warning overdue-tooltip" data-tooltip="${overdueCount} job${overdueCount > 1 ? 's' : ''} overdue by ${daysOverdue} day${daysOverdue > 1 ? 's' : ''}">
                <svg class="overdue-warning-icon" viewBox="0 0 20 20" fill="currentColor">
                    <path fill-rule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clip-rule="evenodd" />
                </svg>
                ${daysOverdue}d
            </span>`;
        }
        
        btn.innerHTML = buttonContent;
        btn.onclick = () => openClientModal(client, jobs);
        
        // Only animate if this client hasn't been animated before
        if (!animatedClients.has(client)) {
            animatedClients.add(client);
            btn.style.animation = 'bounceIn 0.6s ease-out';
        } else {
            btn.style.animation = 'none';
        }
        
        clientListDiv.appendChild(btn);
    }
    
    // Show filter results count
    if (totalFilteredClients === 0 && searchTerm) {
        const noResults = document.createElement('div');
        noResults.style.textAlign = 'center';
        noResults.style.color = '#6b7280';
        noResults.style.padding = '20px';
        noResults.textContent = `No customers found matching "${searchTerm}"`;
        clientListDiv.appendChild(noResults);
    }
    
    // Force reapply theme to ensure client buttons use correct colors
    if (selectedPerson) {
        applyUserTheme(selectedPerson);
    }
}

// Add search functionality
const customerSearchInput = document.getElementById('customerSearchInput');
if (customerSearchInput) {
    customerSearchInput.addEventListener('input', () => {
        if (selectedPerson) {
            let jobs = allJobs.filter(job => job.assignedTo === selectedPerson && !isJobInRecycle(job) && !isJobDone(job));
            // Apply filters before grouping
            jobs = applyFiltersToJobs(jobs);
            const clientMap = groupJobsByClient(jobs);
            renderFilteredClientList(clientMap);
        }
    });
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

// Clear Log File logic
const clearLogBtn = document.getElementById('clearLogBtn');
const clearLogPasswordModal = document.getElementById('clearLogPasswordModal');
const clearLogPasswordInput = document.getElementById('clearLogPasswordInput');
const submitClearLogPassword = document.getElementById('submitClearLogPassword');
const cancelClearLogPassword = document.getElementById('cancelClearLogPassword');
const clearLogPasswordStatus = document.getElementById('clearLogPasswordStatus');

if (clearLogBtn) {
  clearLogBtn.addEventListener('click', () => {
    clearLogPasswordInput.value = '';
    clearLogPasswordStatus.textContent = '';
    clearLogPasswordModal.style.display = 'flex';
    clearLogPasswordInput.focus();
  });
}
if (cancelClearLogPassword) {
  cancelClearLogPassword.addEventListener('click', () => {
    clearLogPasswordModal.style.display = 'none';
  });
}
if (submitClearLogPassword) {
  submitClearLogPassword.addEventListener('click', () => {
    const password = clearLogPasswordInput.value;
    if (password === 'THENETWORKING') {
      set(ref(database, 'logs'), null)
        .then(() => {
          clearLogPasswordStatus.style.color = '#4fc3f7';
          clearLogPasswordStatus.textContent = 'Log file cleared!';
          setTimeout(() => {
            clearLogPasswordModal.style.display = 'none';
            clearLogPasswordStatus.textContent = '';
          }, 1200);
        })
        .catch((err) => {
          clearLogPasswordStatus.style.color = '#b23c3c';
          clearLogPasswordStatus.textContent = 'Error clearing log: ' + err.message;
        });
    } else {
      clearLogPasswordStatus.style.color = '#b23c3c';
      clearLogPasswordStatus.textContent = 'Incorrect password.';
    }
  });
}

// Add edit job modal HTML to the page if not present
if (!document.getElementById('editJobModal')) {
    const editModal = document.createElement('div');
    editModal.className = 'modal';
    editModal.id = 'editJobModal';
    editModal.style.display = 'none';
    editModal.style.alignItems = 'center';
    editModal.style.justifyContent = 'center';
    editModal.style.zIndex = '4000';
    editModal.innerHTML = `
        <div class="a4-modal-content" id="editJobModalContent" style="max-width:600px;width:98vw;position:relative;">
            <button class="close-modal-btn" id="closeEditJobModalBtn" style="top:18px;right:32px;">&times;</button>
            <h2 style="color:#7c3aed;text-align:center;">Edit Job Card</h2>
            <form id="editJobForm">
                <!-- Dynamic form fields will be inserted here -->
            </form>
            <div id="editJobStatus" style="margin-top:10px;color:#e11d48;"></div>
        </div>
    `;
    document.body.appendChild(editModal);
}

// Add send-along modal HTML to the page if not present
if (!document.getElementById('sendAlongModal')) {
    const sendModal = document.createElement('div');
    sendModal.className = 'modal';
    sendModal.id = 'sendAlongModal';
    sendModal.style.display = 'none';
    sendModal.style.alignItems = 'center';
    sendModal.style.justifyContent = 'center';
    sendModal.style.zIndex = '4100';
    sendModal.innerHTML = `
        <div class="a4-modal-content" id="sendAlongModalContent" style="max-width:400px;width:98vw;position:relative;">
            <button class="close-modal-btn" id="closeSendAlongModalBtn" style="top:18px;right:32px;">&times;</button>
            <h2 style="color:#38bdf8;text-align:center;">Send Job Along</h2>
            <form id="sendAlongForm">
                <label for="sendAlongUser">Send to:</label>
                <select id="sendAlongUser" name="sendAlongUser" required style="width:100%;margin-bottom:18px;"></select>
                <button type="submit" class="btn" style="margin-top:10px;">Send</button>
            </form>
            <div id="sendAlongStatus" style="margin-top:10px;color:#e11d48;"></div>
        </div>
    `;
    document.body.appendChild(sendModal);
}

// Popup notification function
function showPopupNotification(message, type = 'default', duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `popup-notification ${type}`;
    notification.textContent = message;
    
    // Add to body
    document.body.appendChild(notification);
    
    // Remove after duration
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 500);
    }, duration);
}

// Welcome back popup system
function checkAndShowWelcomeBack(user) {
    const loginRef = ref(database, 'userLogins/' + user);
    
    onValue(loginRef, (snapshot) => {
        const lastLogin = snapshot.val();
        const now = Date.now();
        const fiveHours = 5 * 60 * 60 * 1000; // 5 hours in milliseconds
        
        if (!lastLogin || (now - lastLogin) > fiveHours) {
            // Determine notification type based on user
            let notificationType = 'default';
            switch(user) {
                case 'Yolandie':
                    notificationType = 'purple';
                    break;
                case 'Francois':
                    notificationType = 'success';
                    break;
                case 'Andre':
                    notificationType = 'gold';
                    break;
                case 'Neil':
                    notificationType = 'teal';
                    break;
            }
            
            // Show welcome back message with user-specific color
            showPopupNotification(`Welcome back, ${user}! 👋`, notificationType, 5000);
            
            // Update last login time in Firebase
            set(loginRef, now);
        }
    }, { once: true }); // Only check once, don't listen for changes
}

// Add event listener for Home button
if (document.getElementById('homeBtn')) {
    document.getElementById('homeBtn').addEventListener('click', function() {
        window.open('https://thenetwork1ng.github.io/Office-view/', '_blank');
    });
}

// Testing Suite Functions
let testJobCounter = 1;

// Listen for 'T' key to toggle testing modal
document.addEventListener('keydown', function(e) {
    if (e.key.toLowerCase() === 't' && !e.ctrlKey && !e.altKey && !e.metaKey) {
        // Don't trigger if user is typing in an input field
        const activeElement = document.activeElement;
        if (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.contentEditable === 'true') {
            return;
        }
        
        const testModal = document.getElementById('testModal');
        if (testModal) {
            const isOpening = testModal.style.display !== 'flex';
            testModal.style.display = isOpening ? 'flex' : 'none';
            
            if (isOpening) {
                updateTestStatus('Testing modal opened. Loading password overview...');
                // Initialize password overview when opening
                refreshPasswordOverview();
            } else {
                updateTestStatus('Testing modal closed. Press T to reopen.');
            }
        }
    }
});

function updateTestStatus(message) {
    const testStatus = document.getElementById('testStatus');
    if (testStatus) {
        const timestamp = new Date().toLocaleTimeString();
        testStatus.textContent = `[${timestamp}] ${message}`;
    }
}

// Individual date testing functions
function createJobToday() {
    createTestJob('today');
}

function createJob3DaysOld() {
    createTestJob('3days');
}

function createJob5DaysOld() {
    createTestJob('5days');
}

function createJobWeekOld() {
    createTestJob('week');
}

function createTestJob(ageType) {
    const testCustomers = ['Test Corp', 'Alpha Inc', 'Beta Ltd', 'Gamma Co', 'Delta LLC'];
    const testEmails = ['test@example.com', 'alpha@test.com', 'beta@demo.com', 'gamma@sample.com'];
    const testProducts = [
        { stickers: ['Vinyl Stickers', 'Logo Stickers'] },
        { other: ['Business Cards', 'Flyers'] },
        { banner_canvas: ['Banner 2x1m', 'Canvas Print'] },
        { boards: ['Corflute Board', 'Foam Board'] }
    ];
    
    let jobDate = new Date();
    let dateLabel = '';
    
    switch(ageType) {
        case 'today':
            // Today's date
            dateLabel = 'today';
            break;
        case '3days':
            jobDate.setDate(jobDate.getDate() - 3);
            dateLabel = '3 days ago (at threshold)';
            break;
        case '5days':
            jobDate.setDate(jobDate.getDate() - 5);
            dateLabel = '5 days ago (overdue)';
            break;
        case 'week':
            jobDate.setDate(jobDate.getDate() - 7);
            dateLabel = '1 week ago (very overdue)';
            break;
    }
    
    const customer = testCustomers[Math.floor(Math.random() * testCustomers.length)];
    const product = testProducts[Math.floor(Math.random() * testProducts.length)];
    const assignedTo = selectedPerson || allowedPeople[Math.floor(Math.random() * allowedPeople.length)];
    
    const testJob = {
        customerName: `${customer} (Test ${testJobCounter})`,
        customerCell: `+27${Math.floor(Math.random() * 1000000000).toString().padStart(9, '0')}`,
        email: testEmails[Math.floor(Math.random() * testEmails.length)],
        date: jobDate.toISOString().split('T')[0],
        jobTotal: (Math.random() * 5000 + 500).toFixed(2),
        deposit: (Math.random() * 1000).toFixed(2),
        balanceDue: (Math.random() * 2000).toFixed(2),
        jobDescription: `Test job created ${dateLabel} for testing overdue functionality.`,
        assignedTo: assignedTo,
        ...product
    };
    
    // Add to Firebase
    const jobRef = push(ref(database, 'jobCards'));
    set(jobRef, testJob).then(() => {
        updateTestStatus(`Created test job for ${customer} (${dateLabel}) assigned to ${assignedTo}`);
        testJobCounter++;
        if (selectedPerson) {
            renderJobsForPerson(selectedPerson);
        }
    }).catch(err => {
        updateTestStatus(`Error creating test job: ${err.message}`);
    });
}

function createCustomDateJob() {
    const customDays = parseInt(document.getElementById('customDaysOld')?.value) || 4;
    let jobDate = new Date();
    jobDate.setDate(jobDate.getDate() - customDays);
    
    const testJob = {
        customerName: `Custom Test Job ${testJobCounter}`,
        customerCell: '+27123456789',
        email: 'custom@test.com',
        date: jobDate.toISOString().split('T')[0],
        jobTotal: '1500.00',
        deposit: '500.00',
        balanceDue: '1000.00',
        jobDescription: `Custom test job created ${customDays} days ago.`,
        assignedTo: selectedPerson || 'Andre',
        stickers: ['Custom Test Stickers']
    };
    
    const jobRef = push(ref(database, 'jobCards'));
    set(jobRef, testJob).then(() => {
        updateTestStatus(`Created custom test job ${customDays} days old assigned to ${testJob.assignedTo}`);
        testJobCounter++;
        if (selectedPerson) {
            renderJobsForPerson(selectedPerson);
        }
    }).catch(err => {
        updateTestStatus(`Error creating custom test job: ${err.message}`);
    });
}

function createBulkTestJobs() {
    const jobPromises = [];
    const ageTypes = ['today', '3days', '5days', 'week'];
    
    for (let i = 0; i < 10; i++) {
        const ageType = ageTypes[i % ageTypes.length];
        
        let jobDate = new Date();
        switch(ageType) {
            case '3days': jobDate.setDate(jobDate.getDate() - 3); break;
            case '5days': jobDate.setDate(jobDate.getDate() - 5); break;
            case 'week': jobDate.setDate(jobDate.getDate() - 7); break;
        }
        
        const testJob = {
            customerName: `Bulk Test ${i + 1}`,
            customerCell: `+2782${(1000000 + i).toString()}`,
            email: `bulk${i}@test.com`,
            date: jobDate.toISOString().split('T')[0],
            jobTotal: (Math.random() * 3000 + 200).toFixed(2),
            deposit: (Math.random() * 800).toFixed(2),
            balanceDue: (Math.random() * 1500).toFixed(2),
            jobDescription: `Bulk test job #${i + 1} for testing purposes.`,
            assignedTo: allowedPeople[i % allowedPeople.length],
            stickers: i % 2 === 0 ? ['Test Stickers'] : [],
            other: i % 3 === 0 ? ['Test Items'] : [],
            banner_canvas: i % 4 === 0 ? ['Test Banner'] : [],
            boards: i % 5 === 0 ? ['Test Board'] : []
        };
        
        const jobRef = push(ref(database, 'jobCards'));
        jobPromises.push(set(jobRef, testJob));
    }
    
    Promise.all(jobPromises).then(() => {
        updateTestStatus('Created 10 bulk test jobs across all users and date ranges');
        testJobCounter += 10;
        if (selectedPerson) {
            renderJobsForPerson(selectedPerson);
        }
    }).catch(err => {
        updateTestStatus(`Error creating bulk test jobs: ${err.message}`);
    });
}

function quickSwitchUser(userName) {
    if (!allowedPeople.includes(userName)) {
        updateTestStatus(`Error: ${userName} is not a valid user`);
        return;
    }
    
    selectedPerson = userName;
    hidePersonModal();
    document.getElementById('testModal').style.display = 'none';
    
    // Apply theme and render jobs
    applyUserTheme(userName);
    renderJobsForPerson(userName);
    
    updateTestStatus(`Switched to user: ${userName}`);
}

function testOverdueFilter() {
    // Set job status filter to overdue
    const jobStatusFilter = document.getElementById('jobStatusFilter');
    if (jobStatusFilter) {
        jobStatusFilter.value = 'overdue';
        updateFiltersFromInputs();
        if (selectedPerson) {
            renderJobsForPerson(selectedPerson);
        }
        updateTestStatus('Applied overdue filter - showing only jobs older than 3 days');
    }
}

function testRecentFilter() {
    // Set job status filter to recent
    const jobStatusFilter = document.getElementById('jobStatusFilter');
    if (jobStatusFilter) {
        jobStatusFilter.value = 'recent';
        updateFiltersFromInputs();
        if (selectedPerson) {
            renderJobsForPerson(selectedPerson);
        }
        updateTestStatus('Applied recent filter - showing only jobs 3 days or newer');
    }
}

function testPaymentFilter(status) {
    const paymentStatusFilter = document.getElementById('paymentStatusFilter');
    if (paymentStatusFilter) {
        paymentStatusFilter.value = status;
        updateFiltersFromInputs();
        if (selectedPerson) {
            renderJobsForPerson(selectedPerson);
        }
        updateTestStatus(`Applied payment filter: ${status}`);
    }
}

function testProductFilter(productType) {
    const productTypeFilter = document.getElementById('productTypeFilter');
    if (productTypeFilter) {
        productTypeFilter.value = productType;
        updateFiltersFromInputs();
        if (selectedPerson) {
            renderJobsForPerson(selectedPerson);
        }
        updateTestStatus(`Applied product filter: ${productType}`);
    }
}

function clearTestData() {
    if (!confirm('This will delete all jobs with "Test" in the customer name. Are you sure?')) {
        return;
    }
    
    const testJobs = allJobs.filter(job => 
        job.customerName && job.customerName.toLowerCase().includes('test')
    );
    
    const deletePromises = testJobs.map(job => 
        remove(ref(database, 'jobCards/' + job._key))
    );
    
    Promise.all(deletePromises).then(() => {
        updateTestStatus(`Deleted ${testJobs.length} test jobs from database`);
        if (selectedPerson) {
            renderJobsForPerson(selectedPerson);
        }
    }).catch(err => {
        updateTestStatus(`Error deleting test jobs: ${err.message}`);
    });
}

function simulateOverdueScenario() {
    // Create a scenario with mixed overdue and recent jobs
    const scenarios = [
        { days: 0, customer: 'Fresh Job Today' },
        { days: 2, customer: 'Almost Due Job' },
        { days: 4, customer: 'Slightly Overdue' },
        { days: 7, customer: 'Very Overdue Job' },
        { days: 14, customer: 'Extremely Overdue' }
    ];
    
    const jobPromises = scenarios.map((scenario, index) => {
        let jobDate = new Date();
        jobDate.setDate(jobDate.getDate() - scenario.days);
        
        const testJob = {
            customerName: scenario.customer,
            customerCell: `+2781000${index.toString().padStart(4, '0')}`,
            email: `scenario${index}@test.com`,
            date: jobDate.toISOString().split('T')[0],
            jobTotal: '2000.00',
            deposit: '1000.00',
            balanceDue: '1000.00',
            jobDescription: `Scenario job created ${scenario.days} days ago for overdue testing.`,
            assignedTo: selectedPerson || 'Andre',
            stickers: ['Test Scenario Stickers']
        };
        
        const jobRef = push(ref(database, 'jobCards'));
        return set(jobRef, testJob);
    });
    
    Promise.all(jobPromises).then(() => {
        updateTestStatus('Created overdue test scenario: 5 jobs with varying ages (0, 2, 4, 7, 14 days old)');
        if (selectedPerson) {
            renderJobsForPerson(selectedPerson);
        }
    }).catch(err => {
        updateTestStatus(`Error creating overdue scenario: ${err.message}`);
    });
}

function generateTestReport() {
    const totalJobs = allJobs.length;
    const overdueJobs = allJobs.filter(job => isJobOverdue(job));
    const recentJobs = allJobs.filter(job => !isJobOverdue(job));
    const userJobs = selectedPerson ? allJobs.filter(job => job.assignedTo === selectedPerson) : [];
    const testJobs = allJobs.filter(job => job.customerName && job.customerName.toLowerCase().includes('test'));
    
    const report = `
=== TEST REPORT ===
Total Jobs: ${totalJobs}
Overdue Jobs (>3 days): ${overdueJobs.length}
Recent Jobs (≤3 days): ${recentJobs.length}
Current User (${selectedPerson || 'None'}): ${userJobs.length} jobs
Test Jobs: ${testJobs.length}

Jobs by User:
${allowedPeople.map(user => {
    const userJobCount = allJobs.filter(job => job.assignedTo === user).length;
    const userOverdueCount = allJobs.filter(job => job.assignedTo === user && isJobOverdue(job)).length;
    return `- ${user}: ${userJobCount} jobs (${userOverdueCount} overdue)`;
}).join('\n')}

Current Filters:
- Date Range: ${currentFilters.dateFrom || 'None'} to ${currentFilters.dateTo || 'None'}
- Job Total: ${currentFilters.minTotal || 'Min: None'} - ${currentFilters.maxTotal || 'Max: None'}
- Product Type: ${currentFilters.productType || 'All'}
- Payment Status: ${currentFilters.paymentStatus || 'All'}
- Job Status: ${currentFilters.jobStatus || 'All'}
- Sort By: ${currentFilters.sortBy || 'date-desc'}
    `;
    
    updateTestStatus(report);
    console.log(report);
}

// Make testing functions globally available for HTML onclick handlers
window.createJobToday = createJobToday;
window.createJob3DaysOld = createJob3DaysOld;
window.createJob5DaysOld = createJob5DaysOld;
window.createJobWeekOld = createJobWeekOld;
window.createTestJob = createTestJob;
window.createBulkTestJobs = createBulkTestJobs;
window.quickSwitchUser = quickSwitchUser;
window.testOverdueFilter = testOverdueFilter;
window.testRecentFilter = testRecentFilter;
window.testPaymentFilter = testPaymentFilter;
window.testProductFilter = testProductFilter;
window.clearTestData = clearTestData;
window.createCustomDateJob = createCustomDateJob;
window.simulateOverdueScenario = simulateOverdueScenario;
window.generateTestReport = generateTestReport;
window.clearAllFilters = clearAllFilters; 

// Admin Password Management Functions
async function changeUserPasswordAdmin() {
    const targetUser = document.getElementById('adminTargetUser').value.trim();
    const newPassword = document.getElementById('adminNewPassword').value.trim();
    
    if (!targetUser) {
        updateTestStatus('❌ Please enter a username to manage');
        return;
    }
    
    if (!newPassword) {
        updateTestStatus('❌ Please enter a new password');
        return;
    }
    
    if (!allowedPeople.includes(targetUser)) {
        updateTestStatus(`❌ User "${targetUser}" not found in system`);
        return;
    }
    
    try {
        // Update password in Firebase
        await set(ref(database, `passwords/${targetUser}`), newPassword);
        
        // Update local cache
        userPasswords[targetUser] = newPassword;
        
        updateTestStatus(`✅ Password changed for user: ${targetUser}`);
        
        // Clear input fields
        document.getElementById('adminTargetUser').value = '';
        document.getElementById('adminNewPassword').value = '';
        
        // Refresh the overview
        refreshPasswordOverview();
        
    } catch (error) {
        console.error('Error changing user password:', error);
        updateTestStatus('❌ Failed to change password: ' + error.message);
    }
}

async function resetUserPasswordAdmin() {
    const targetUser = document.getElementById('adminTargetUser').value.trim();
    
    if (!targetUser) {
        updateTestStatus('❌ Please enter a username to reset');
        return;
    }
    
    if (!allowedPeople.includes(targetUser)) {
        updateTestStatus(`❌ User "${targetUser}" not found in system`);
        return;
    }
    
    const confirmReset = confirm(`Are you sure you want to reset the password for "${targetUser}"? This will remove their password protection.`);
    
    if (!confirmReset) {
        updateTestStatus('❌ Password reset cancelled');
        return;
    }
    
    try {
        // Remove password from Firebase
        await remove(ref(database, `passwords/${targetUser}`));
        
        // Update local cache
        delete userPasswords[targetUser];
        
        updateTestStatus(`✅ Password reset for user: ${targetUser} (no password required)`);
        
        // Clear input field
        document.getElementById('adminTargetUser').value = '';
        
        // Refresh the overview
        refreshPasswordOverview();
        
    } catch (error) {
        console.error('Error resetting user password:', error);
        updateTestStatus('❌ Failed to reset password: ' + error.message);
    }
}

// Enhanced password management functions
async function refreshPasswordOverview() {
    try {
        // Get fresh data from Firebase
        const snapshot = await get(ref(database, 'passwords'));
        const passwords = snapshot.val() || {};
        
        // Update local cache
        userPasswords = passwords;
        
        let statusHtml = '';
        let protectedCount = 0;
        let unprotectedCount = 0;
        
        allowedPeople.forEach(user => {
            const hasPassword = passwords[user];
            const status = hasPassword ? '🔒 Protected' : '🔓 Unprotected';
            const color = hasPassword ? '#10b981' : '#f59e0b';
            
            statusHtml += `<div style="display:flex;justify-content:space-between;padding:2px 0;">
                <span>${user}:</span>
                <span style="color:${color};font-weight:600;">${status}</span>
            </div>`;
            
            if (hasPassword) protectedCount++;
            else unprotectedCount++;
        });
        
        statusHtml += `<div style="margin-top:8px;padding-top:8px;border-top:1px solid #e2e8f0;font-size:0.85rem;color:#6b7280;">
            Protected: ${protectedCount} | Unprotected: ${unprotectedCount} | Total: ${allowedPeople.length}
        </div>`;
        
        document.getElementById('passwordStatusList').innerHTML = statusHtml;
        
        // Populate dropdown
        const select = document.getElementById('adminTargetUserSelect');
        select.innerHTML = '<option value="">Select user to manage...</option>';
        allowedPeople.forEach(user => {
            const hasPassword = passwords[user] ? ' 🔒' : ' 🔓';
            select.innerHTML += `<option value="${user}">${user}${hasPassword}</option>`;
        });
        
    } catch (error) {
        console.error('Error refreshing password overview:', error);
        document.getElementById('passwordStatusList').innerHTML = 'Error loading status';
    }
}

async function showUsersWithPasswords() {
    try {
        const snapshot = await get(ref(database, 'passwords'));
        const passwords = snapshot.val() || {};
        
        const protectedUsers = allowedPeople.filter(user => passwords[user]);
        
        if (protectedUsers.length === 0) {
            updateTestStatus('ℹ️ No users currently have password protection');
            return;
        }
        
        let report = '=== USERS WITH PASSWORD PROTECTION ===\n\n';
        protectedUsers.forEach(user => {
            report += `🔒 ${user} (Password: ${passwords[user]})\n`;
        });
        report += `\nTotal Protected Users: ${protectedUsers.length}`;
        
        updateTestStatus(report);
        
    } catch (error) {
        console.error('Error showing protected users:', error);
        updateTestStatus('❌ Failed to load protected users: ' + error.message);
    }
}

async function showUsersWithoutPasswords() {
    try {
        const snapshot = await get(ref(database, 'passwords'));
        const passwords = snapshot.val() || {};
        
        const unprotectedUsers = allowedPeople.filter(user => !passwords[user]);
        
        if (unprotectedUsers.length === 0) {
            updateTestStatus('ℹ️ All users currently have password protection');
            return;
        }
        
        let report = '=== USERS WITHOUT PASSWORD PROTECTION ===\n\n';
        unprotectedUsers.forEach(user => {
            report += `🔓 ${user} (No password required)\n`;
        });
        report += `\nTotal Unprotected Users: ${unprotectedUsers.length}`;
        
        updateTestStatus(report);
        
    } catch (error) {
        console.error('Error showing unprotected users:', error);
        updateTestStatus('❌ Failed to load unprotected users: ' + error.message);
    }
}

async function viewAllUserPasswordsDetailed() {
    try {
        // Get fresh data from Firebase
        const snapshot = await get(ref(database, 'passwords'));
        const passwords = snapshot.val() || {};
        
        let report = '=== DETAILED USER PASSWORD STATUS ===\n\n';
        
        // Protected users section
        const protectedUsers = allowedPeople.filter(user => passwords[user]);
        if (protectedUsers.length > 0) {
            report += '🔒 PROTECTED USERS:\n';
            protectedUsers.forEach(user => {
                report += `   ${user}: "${passwords[user]}"\n`;
            });
            report += '\n';
        }
        
        // Unprotected users section
        const unprotectedUsers = allowedPeople.filter(user => !passwords[user]);
        if (unprotectedUsers.length > 0) {
            report += '🔓 UNPROTECTED USERS:\n';
            unprotectedUsers.forEach(user => {
                report += `   ${user}: No password\n`;
            });
            report += '\n';
        }
        
        // Summary
        report += '📊 SUMMARY:\n';
        report += `   Total Users: ${allowedPeople.length}\n`;
        report += `   Protected: ${protectedUsers.length}\n`;
        report += `   Unprotected: ${unprotectedUsers.length}\n`;
        report += `   Protection Rate: ${Math.round((protectedUsers.length / allowedPeople.length) * 100)}%`;
        
        updateTestStatus(report);
        console.log(report);
        
    } catch (error) {
        console.error('Error viewing detailed user passwords:', error);
        updateTestStatus('❌ Failed to load detailed user passwords: ' + error.message);
    }
}

async function resetAllPasswords() {
    const confirmReset = confirm(`⚠️ WARNING: This will remove password protection from ALL users!\n\nAre you absolutely sure you want to reset all passwords?`);
    
    if (!confirmReset) {
        updateTestStatus('❌ Mass password reset cancelled');
        return;
    }
    
    const doubleConfirm = confirm(`This action cannot be undone. Type 'RESET ALL' in the next prompt to confirm.`);
    
    if (!doubleConfirm) {
        updateTestStatus('❌ Mass password reset cancelled');
        return;
    }
    
    const finalConfirm = prompt('Type "RESET ALL" to confirm mass password reset:');
    
    if (finalConfirm !== 'RESET ALL') {
        updateTestStatus('❌ Mass password reset cancelled - incorrect confirmation');
        return;
    }
    
    try {
        // Remove all passwords from Firebase
        await remove(ref(database, 'passwords'));
        
        // Clear local cache
        userPasswords = {};
        
        updateTestStatus(`✅ All passwords have been reset. ${allowedPeople.length} users now have no password protection.`);
        
        // Refresh the overview
        refreshPasswordOverview();
        
    } catch (error) {
        console.error('Error resetting all passwords:', error);
        updateTestStatus('❌ Failed to reset all passwords: ' + error.message);
    }
}

// Functions for dropdown-based user management
async function changeUserPasswordAdminSelect() {
    const targetUser = document.getElementById('adminTargetUserSelect').value;
    const newPassword = document.getElementById('adminNewPassword').value.trim();
    
    if (!targetUser) {
        updateTestStatus('❌ Please select a user to manage');
        return;
    }
    
    if (!newPassword) {
        updateTestStatus('❌ Please enter a new password');
        return;
    }
    
    try {
        // Update password in Firebase
        await set(ref(database, `passwords/${targetUser}`), newPassword);
        
        // Update local cache
        userPasswords[targetUser] = newPassword;
        
        updateTestStatus(`✅ Password set for ${targetUser}: "${newPassword}"`);
        
        // Clear password input
        document.getElementById('adminNewPassword').value = '';
        
        // Refresh the overview
        refreshPasswordOverview();
        
    } catch (error) {
        console.error('Error changing user password:', error);
        updateTestStatus('❌ Failed to change password: ' + error.message);
    }
}

async function resetUserPasswordAdminSelect() {
    const targetUser = document.getElementById('adminTargetUserSelect').value;
    
    if (!targetUser) {
        updateTestStatus('❌ Please select a user to reset');
        return;
    }
    
    const confirmReset = confirm(`Remove password protection for "${targetUser}"?`);
    
    if (!confirmReset) {
        updateTestStatus('❌ Password reset cancelled');
        return;
    }
    
    try {
        // Remove password from Firebase
        await remove(ref(database, `passwords/${targetUser}`));
        
        // Update local cache
        delete userPasswords[targetUser];
        
        updateTestStatus(`✅ Password removed for ${targetUser} (no longer protected)`);
        
        // Refresh the overview
        refreshPasswordOverview();
        
    } catch (error) {
        console.error('Error resetting user password:', error);
        updateTestStatus('❌ Failed to reset password: ' + error.message);
    }
}

async function viewUserPasswordDetails() {
    const targetUser = document.getElementById('adminTargetUserSelect').value;
    
    if (!targetUser) {
        updateTestStatus('❌ Please select a user to view details');
        return;
    }
    
    try {
        const snapshot = await get(ref(database, `passwords/${targetUser}`));
        const password = snapshot.val();
        
        let report = `=== USER DETAILS: ${targetUser} ===\n\n`;
        
        if (password) {
            report += `🔒 Status: Password Protected\n`;
            report += `🔑 Password: "${password}"\n`;
            report += `📅 Last Updated: Available in Firebase\n`;
        } else {
            report += `🔓 Status: No Password Protection\n`;
            report += `🔑 Password: Not Set\n`;
            report += `⚠️ Warning: User can access without authentication\n`;
        }
        
        report += `\n👤 User: ${targetUser}`;
        report += `\n📊 System Role: Standard User`;
        
        updateTestStatus(report);
        
    } catch (error) {
        console.error('Error viewing user details:', error);
        updateTestStatus('❌ Failed to load user details: ' + error.message);
    }
}

async function viewAllUserPasswords() {
    await viewAllUserPasswordsDetailed();
}

// Make enhanced admin functions globally available
window.changeUserPasswordAdmin = changeUserPasswordAdmin;
window.resetUserPasswordAdmin = resetUserPasswordAdmin;
window.viewAllUserPasswords = viewAllUserPasswords;
window.refreshPasswordOverview = refreshPasswordOverview;
window.showUsersWithPasswords = showUsersWithPasswords;
window.showUsersWithoutPasswords = showUsersWithoutPasswords;
window.viewAllUserPasswordsDetailed = viewAllUserPasswordsDetailed;
window.resetAllPasswords = resetAllPasswords;
window.changeUserPasswordAdminSelect = changeUserPasswordAdminSelect;
window.resetUserPasswordAdminSelect = resetUserPasswordAdminSelect;
window.viewUserPasswordDetails = viewUserPasswordDetails; 

// -------- Kanboard helpers (render + actions) --------
async function initKanboardSection(job, force = false) {
    const section = document.getElementById(`kb-${job._key}`);
    if (!section) return;
    try {
        const task = await kbGetTask(job.apiTaskId);
        // Prefill column select
        const colInput = document.getElementById(`kb-col-${job._key}`);
        // Store latest task snapshot for move
        section.dataset.projectId = task.project_id;
        section.dataset.taskId = task.id || job.apiTaskId;
        section.dataset.swimlaneId = task.swimlane_id || 1;
    section.dataset.columnId = task.column_id || '';
    } catch (err) {
        // Keep silent in UI; optionally console error
        console.error('Kanboard load error:', err);
    }
}

async function handleKanboardMove(job, overrideColumnId) {
    const section = document.getElementById(`kb-${job._key}`);
    if (!section) return;
    const project_id = Number(section.dataset.projectId);
    const task_id = Number(section.dataset.taskId || job.apiTaskId);
    const column_id = Number(overrideColumnId || section.dataset.columnId || 0);
    const position = 1; // default to top
    const swimlane_id = Number(section.dataset.swimlaneId || 1);
    if ([project_id, task_id, column_id, position, swimlane_id].some(v => !v || isNaN(v) || v <= 0)) {
        return;
    }
    try {
        const ok = await kbMoveTask({ project_id, task_id, column_id, position, swimlane_id });
    if (ok) {
            showPopupNotification('Task moved in Kanboard', 'success', 2500);
            await initKanboardSection(job, true);
        } else {
            showPopupNotification('Failed to move task (API returned false)', 'danger', 3000);
        }
    } catch (err) {
        console.error('Kanboard move error:', err);
        showPopupNotification('Error moving task: ' + (err.message || err), 'danger', 3500);
    }
}