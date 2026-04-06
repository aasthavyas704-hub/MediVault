let currentUser = null;

const GEMINI_API_KEY = "AIzaSyAmiY7-BO8zSxNvF8L0vWCcP8YA0L5E5Bw"; // Replace with your real key

// 5. Load Appointments
async function loadAppointments() {
    // Load doctors for booking
    const { data: doctors, error: docError } = await supabaseClient
        .from('doctors')
        .select('*');

    if (docError) console.error('Error loading doctors:', docError);

    const doctorSelect = document.getElementById('book-doctor-select');
    doctorSelect.innerHTML = '<option value="">Select Doctor</option>' + (doctors || []).map(doc => `
        <option value="${doc.id}">${doc.name}</option>
    `).join('');

    // Load user's appointments
    const { data: appointments, error: aptError } = await supabaseClient
        .from('appointments')
        .select('*')
        .eq('patient_id', currentUser.id)
        .order('appointment_time', { ascending: true });

    if (aptError) {
        console.error('Error loading appointments:', aptError);
        // Don't show error to user if no appointments exist yet
        if (aptError.code !== 'PGRST116') {
            showNotification("Error loading appointments: " + aptError.message, "error");
        }
    }

    // Create doctor name map
    const doctorMap = {};
    doctors.forEach(doc => doctorMap[doc.id] = doc.name);

    const appointmentsList = document.getElementById('my-appointments-list');
    appointmentsList.innerHTML = (appointments || []).length ? appointments.map(apt => `
        <div class="appointment-item" style="border: 1px solid var(--border); padding: 10px; margin-bottom: 10px; border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <strong>${new Date(apt.appointment_time).toLocaleString()} - Dr. ${doctorMap[apt.doctor_id] || 'Doctor'}</strong>
                    <p>Status: ${apt.status}</p>
                </div>
                <div>
                    ${apt.status === 'scheduled' ? `<button onclick="cancelAppointment('${apt.id}')" class="btn-danger" style="font-size: 0.8rem; padding: 4px 8px;">Cancel</button>` : ''}
                </div>
            </div>
        </div>
    `).join('') : '<p>No appointments scheduled.</p>';
}

// Cancel Appointment
async function cancelAppointment(appointmentId) {
    showCancelConfirmation(appointmentId);
}

// Show custom confirmation dialog
function showCancelConfirmation(appointmentId) {
    // Remove any existing confirmation dialog
    const existingDialog = document.querySelector('.cancel-confirmation');
    if (existingDialog) {
        existingDialog.remove();
    }

    // Create confirmation dialog
    const dialog = document.createElement('div');
    dialog.className = 'cancel-confirmation';
    dialog.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; display: flex; align-items: center; justify-content: center;">
            <div style="background: white; padding: 20px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); max-width: 400px; width: 90%;">
                <h3 style="margin: 0 0 15px 0; color: #dc2626;">Cancel Appointment</h3>
                <p style="margin: 0 0 20px 0; color: #374151;">Are you sure you want to cancel this appointment? This action cannot be undone.</p>
                <div style="display: flex; gap: 10px; justify-content: flex-end;">
                    <button onclick="this.closest('.cancel-confirmation').remove()" style="padding: 8px 16px; border: 1px solid #d1d5db; background: white; border-radius: 6px; cursor: pointer;">Keep Appointment</button>
                    <button onclick="confirmCancel('${appointmentId}')" style="padding: 8px 16px; background: #dc2626; color: white; border: none; border-radius: 6px; cursor: pointer;">Cancel Appointment</button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(dialog);
}

// Confirm cancellation
async function confirmCancel(appointmentId) {
    // Remove the confirmation dialog
    const dialog = document.querySelector('.cancel-confirmation');
    if (dialog) dialog.remove();

    // STEP 1: Get appointment details to find the slot
    const { data: appointment, error: fetchError } = await supabaseClient
        .from('appointments')
        .select('slot_id, doctor_id, appointment_time')
        .eq('id', appointmentId)
        .single();

    if (fetchError || !appointment) {
        console.error("Error fetching appointment:", fetchError);
        showNotification("Failed to retrieve appointment details", "error");
        return;
    }

    // STEP 2: Delete the appointment
    const { error: deleteError } = await supabaseClient
        .from('appointments')
        .delete()
        .eq('id', appointmentId);

    if (deleteError) {
        console.error("Cancellation Error:", deleteError);
        showNotification("Failed to cancel: " + deleteError.message, "error");
        return;
    }

    // STEP 3: Decrement the booking count for the slot
    if (appointment.slot_id) {
        const { data: slot, error: slotFetchError } = await supabaseClient
            .from('doctor_availability')
            .select('current_bookings')
            .eq('id', appointment.slot_id)
            .single();

        if (!slotFetchError && slot && slot.current_bookings > 0) {
            const { error: updateError } = await supabaseClient
                .from('doctor_availability')
                .update({ current_bookings: slot.current_bookings - 1 })
                .eq('id', appointment.slot_id);

            if (updateError) {
                console.error("Error updating slot booking count:", updateError);
            } else {
                console.log('✓ Booking count decremented for slot', appointment.slot_id);
            }
        }
    }

    showNotification("Appointment cancelled successfully!", "success");

    // STEP 4: Refresh both appointments and available slots
    await loadAppointments();
    
    // Refresh available slots if they were being displayed
    const doctorSelect = document.getElementById('book-doctor-select');
    const dateSelect = document.getElementById('book-appointment-date');
    if (doctorSelect?.value && dateSelect?.value) {
        await loadAvailableSlots(doctorSelect.value, dateSelect.value);
    }
}

// 6. Availability and Book Appointment

function setAvailabilityLoading(isLoading) {
    const loadBtn = document.getElementById('load-availability-button');
    const slotSelect = document.getElementById('available-slot-select');
    if (loadBtn) {
        loadBtn.disabled = isLoading;
        loadBtn.innerText = isLoading ? 'Loading …' : 'Load Available Slots';
    }
    if (slotSelect) slotSelect.disabled = isLoading;
}

async function loadAvailableSlots(doctorId, date) {
    if (!doctorId || !date) {
        showNotification('Please choose doctor and date to load slots.', 'warning');
        return;
    }
    setAvailabilityLoading(true);

    const { data: slots, error } = await supabaseClient
        .from('doctor_availability')
        .select('*')
        .eq('doctor_id', doctorId)
        .eq('available_date', date)
        .order('start_time', { ascending: true });

    if (error) {
        console.error('Error loading available slots:', error);
        showNotification('Unable to load availability. Please try again.', 'error');
        setAvailabilityLoading(false);
        return;
    }

    console.log('📊 ALL SLOTS FROM DB:', slots);
    slots?.forEach(s => {
        console.log(`  Slot ${s.id}: current_bookings=${s.current_bookings} (type: ${typeof s.current_bookings}), max_capacity=${s.max_capacity}`);
    });

    const availableSlots = (slots || []).filter(s => {
        const booked = s.current_bookings || 0;
        const capacity = s.max_capacity || 1;
        const isAvailable = booked < capacity;
        console.log(`  Filter: ID=${s.id}, booked=${booked}, capacity=${capacity}, available=${isAvailable}`);
        return isAvailable;
    });
    
    console.log('✓ AVAILABLE SLOTS (after filter):', availableSlots.length);
    
    const slotSelect = document.getElementById('available-slot-select');
    const slotInfo = document.getElementById('slot-availability-info');
    if (!slotSelect) return;

    if (availableSlots.length === 0) {
        slotSelect.innerHTML = '<option value="" disabled>No slots available</option>';
        if (slotInfo) slotInfo.innerText = 'No available slots for this doctor/date. Please choose another.';
        setAvailabilityLoading(false);
        return;
    }

    slotSelect.innerHTML = '<option value="">Select a Slot</option>' + availableSlots.map(slot => {
        const booked = slot.current_bookings || 0;
        const free = slot.max_capacity - booked;
        return `<option value="${slot.id}" data-start="${slot.start_time}" data-end="${slot.end_time}">${slot.start_time} - ${slot.end_time} (${free} spots left)</option>`;
    }).join('');

    const totalAvailable = availableSlots.reduce((sum, s) => sum + Math.max(0, (s.max_capacity || 1) - (s.current_bookings || 0)), 0);
    if (slotInfo) slotInfo.innerText = `Showing ${availableSlots.length} slots, total available: ${totalAvailable} seats`;
    setAvailabilityLoading(false);
}

async function bookSlotAppointment(e) {
    e.preventDefault();

    const selectedSlotId = document.getElementById('available-slot-select')?.value;
    if (!selectedSlotId) {
        showNotification('Please select a slot before booking.', 'warning');
        return;
    }

    const { data: slot, error: slotError } = await supabaseClient
        .from('doctor_availability')
        .select('*')
        .eq('id', selectedSlotId)
        .single();

    if (slotError || !slot) {
        console.error('Error fetching slot details:', slotError);
        showNotification('Selected slot is not available. Refresh slots and try again.', 'error');
        return;
    }

    if (slot.current_bookings >= slot.max_capacity) {
        showNotification('This slot is full. Please select another slot.', 'error');
        loadAvailableSlots(slot.doctor_id, slot.available_date);
        return;
    }

    // CHECK FOR DUPLICATE BOOKING: Ensure patient doesn't already have an appointment in this slot
    const { data: existingAppointment, error: checkError } = await supabaseClient
        .from('appointments')
        .select('id')
        .eq('slot_id', selectedSlotId)
        .eq('patient_id', currentUser.id)
        .eq('status', 'scheduled')
        .single();

    if (existingAppointment) {
        showNotification('You already have an appointment in this slot. Please select a different slot.', 'warning');
        return;
    }

    const appointmentTime = new Date(`${slot.available_date}T${slot.start_time}`).toISOString();

    console.log('📞 Calling RPC book_appointment');

    // Use RPC function to atomically create appointment and increment booking count
    const { error } = await supabaseClient.rpc('book_appointment', {
        p_slot_id: slot.id,
        p_patient_id: currentUser.id,
        p_doctor_id: slot.doctor_id,
        p_appointment_time: appointmentTime,
        p_status: 'scheduled'
    });

    if (error) {
        console.error('Booking failed:', error.message);
        showNotification('Booking failed: ' + error.message, 'error');
        return;
    }

    console.log('✓ RPC Success - Appointment booked');
    showNotification('Appointment booked successfully!', 'success');
    document.getElementById('book-appointment-form')?.reset();
    
    // Refresh UI
    await loadAppointments();
    await loadAvailableSlots(slot.doctor_id, slot.available_date);
}

const availabilityButton = document.getElementById('load-availability-button');
if (availabilityButton) {
    availabilityButton.addEventListener('click', () => {
        const doctorId = document.getElementById('book-doctor-select')?.value;
        const date = document.getElementById('book-appointment-date')?.value;
        loadAvailableSlots(doctorId, date);
    });
}

const bookForm = document.getElementById('book-appointment-form');
if (bookForm) {
    bookForm.addEventListener('submit', bookSlotAppointment);
}

// Initialize Dashboard
document.addEventListener('DOMContentLoaded', async () => {
    currentUser = await checkAuth();
    if (!currentUser) return;

    // Verify role with proper redirect
    if (currentUser.user_metadata.role === 'doctor') {
        window.location.href = 'doctor.html';
        return;
    }
    if (currentUser.user_metadata.role === 'receptionist') {
        window.location.href = 'receptionist.html';
        return;
    }
    if (currentUser.user_metadata.role !== 'patient') {
        // Unknown role fallback
        window.location.href = 'index.html';
        return;
    }

    loadProfileData();
    loadRecords();
    loadLogs();
    loadAppointments();
    setupTabSwitching();
});

// Tab Switching Logic
function setupTabSwitching() {
    const tabs = document.querySelectorAll('.nav-tab');
    const contents = document.querySelectorAll('.tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            e.preventDefault();
            const target = tab.getAttribute('data-target');

            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.add('hidden'));

            tab.classList.add('active');
            document.getElementById(target).classList.remove('hidden');
        });
    });
}

async function analyzeSymptoms() {
    const input = document.getElementById('symptom-input').value.trim();
    const resultBox = document.getElementById('ai-result-box');
    const responseText = document.getElementById('ai-response-text');
    const specialistValue = document.getElementById('ai-specialist-value');
    const btn = document.getElementById('analyze-btn');

    if (!input) return showNotification("Please describe your symptoms.", "info");

    btn.disabled = true;
    btn.innerText = "Analyzing...";
    resultBox.classList.remove('hidden');
    responseText.innerHTML = "<em>MediVault AI is analyzing your symptoms...</em>";

    // 1. Use the EXACT model from your working curl
    const MODEL = "gemini-flash-latest";
    const API_KEY = "AIzaSyAmiY7-BO8zSxNvF8L0vWCcP8YA0L5E5Bw";

    // 2. Pass the key in the URL as a parameter (standard for JS fetch)
    const URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`;

    try {
        const response = await fetch(URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: `Context: Medical Symptom Checker. User symptoms: "${input}". \nTask: Provide possible causes, urgency level, recommended specialist, and advice. \nConstraint: Keep it brief and include a medical disclaimer that says: \"I am not a doctor. For true medical emergencies call 102 or your local emergency number.\"` 
                    }]
                }]
            })
        });

        const data = await response.json();

        if (data.error) {
            console.error("API Error:", data.error);
            responseText.innerHTML = `<span style="color:red;">Error ${data.error.code}: ${data.error.message}</span>`;
            return;
        }

        if (data.candidates && data.candidates[0].content.parts[0].text) {
            const aiText = data.candidates[0].content.parts[0].text;
            responseText.innerHTML = aiText
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');

            specialistValue.innerText = extractSpecialist(aiText);
        } else {
            responseText.innerHTML = "AI could not generate a response. Try describing symptoms differently.";
            specialistValue.innerText = 'General physician';
        }

    } catch (err) {
        console.error("Fetch failure:", err);
        responseText.innerHTML = "Connection failed. Please check your internet.";
        specialistValue.innerText = 'General physician';
    } finally {
        btn.disabled = false;
        btn.innerText = "Analyze Symptoms";
    }
}

function extractSpecialist(aiText) {
    if (!aiText || typeof aiText !== 'string') return 'General physician';

    // First, try to extract multiple specialists from a list format
    // e.g., "Recommended Specialist:\n* Gastroenterologist\n* Urologist"
    const listPattern = /(?:Recommended specialist|Suggested specialist|Specialist recommendation)[:\s]*\n(?:\*\s*)?([^\n*]+)/i;
    let match = aiText.match(listPattern);
    if (match && match[1]) {
        let value = match[1].trim();
        value = value.replace(/\s*\(.+?\)/g, '').trim(); // Remove descriptions in parentheses
        if (value.length > 0 && value.split(' ').length <= 4) {
            return value;
        }
    }

    // Try to extract all bullet-pointed specialists
    const bulletsPattern = /(?:Recommended specialist|Suggested specialist|Specialist recommendation)[:\s]*\n([\s\S]*?)(?:\n\n|Advice|$)/i;
    const bulletsMatch = aiText.match(bulletsPattern);
    if (bulletsMatch && bulletsMatch[1]) {
        const bulletLines = bulletsMatch[1].split('\n').filter(line => line.trim().startsWith('*'));
        if (bulletLines.length > 0) {
            // Extract first specialist from bullet list
            const firstBullet = bulletLines[0];
            const specialistMatch = firstBullet.match(/\*\s*([^(]+)/);
            if (specialistMatch && specialistMatch[1]) {
                return specialistMatch[1].trim();
            }
        }
    }

    const candidatePatterns = [
        /(?:Recommended specialist|Suggested specialist|Specialist recommendation|Consult a)[:\s]*([^\.\n\r]+)/i,
        /(?:See a|Visit a)[:\s]*([^\.\n\r]+)/i,
    ];

    for (const pattern of candidatePatterns) {
        match = aiText.match(pattern);
        if (match && match[1]) {
            let value = match[1].trim();
            value = value.replace(/\s*\./g, '').trim();
            if (value.length > 0 && value.split(' ').length <= 4 && !/\b(if|and|or|then|because)\b/i.test(value)) {
                return value;
            }
        }
    }

    const specialties = ['cardiologist', 'dermatologist', 'neurologist', 'orthopedist', 'pediatrician', 'psychiatrist', 'gastroenterologist', 'endocrinologist', 'pulmonologist', 'opthalmologist', 'ophthalmologist', 'ENT', 'urologist', 'rheumatologist', 'oncologist', 'general physician', 'internist'];

    const lowerText = aiText.toLowerCase();
    for (const s of specialties) {
        if (lowerText.includes(s.toLowerCase())) {
            return s.charAt(0).toUpperCase() + s.slice(1);
        }
    }

    return 'General physician';
}

// 1. Load Profile Data
async function loadProfileData() {
    const { data, error } = await supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', currentUser.id)
        .single();

    if (data) {
        const welcomeNameEl = document.getElementById('welcome-name');
        if (welcomeNameEl) welcomeNameEl.innerText = `Welcome, ${data.name}`;

        const displayIdEl = document.getElementById('display-id');
        if (displayIdEl) displayIdEl.innerText = data.id;

        const ageEl = document.getElementById('p-age');
        if (ageEl) ageEl.innerText = data.age || '-';

        const genderEl = document.getElementById('p-gender');
        if (genderEl) genderEl.innerText = data.gender || '-';

        const bloodEl = document.getElementById('p-blood');
        if (bloodEl) bloodEl.innerText = data.blood_group || '-';

        const emergencyEl = document.getElementById('p-emergency');
        if (emergencyEl) emergencyEl.innerText = data.emergency_contact || '-';

        // Handle arrays for display
        const chronicDisplay = Array.isArray(data.chronic_illnesses) ? data.chronic_illnesses.join(', ') : (data.chronic_illnesses || 'None');
        const allergiesDisplay = Array.isArray(data.allergies) ? data.allergies.join(', ') : (data.allergies || 'None');
        const medsDisplay = Array.isArray(data.current_medications) ? data.current_medications.join(', ') : (data.current_medications || '-');

        const chronicEl = document.getElementById('p-chronic');
        if (chronicEl) chronicEl.innerText = chronicDisplay;

        const allergiesEl = document.getElementById('p-allergies');
        if (allergiesEl) allergiesEl.innerText = allergiesDisplay;

        const medsEl = document.getElementById('p-meds');
        if (medsEl) medsEl.innerText = medsDisplay;


        const setName = document.getElementById('set-name');
        if (setName) setName.value = data.name || '';
        const setAge = document.getElementById('set-age');
        if (setAge) setAge.value = data.age || '';
        const setGender = document.getElementById('set-gender');
        if (setGender) setGender.value = data.gender || '';
        const setBlood = document.getElementById('set-blood');
        if (setBlood) setBlood.value = data.blood_group || '';
        const setEmergency = document.getElementById('set-emergency');
        if (setEmergency) setEmergency.value = data.emergency_contact || '';
        const setChronic = document.getElementById('set-chronic');
        if (setChronic) setChronic.value = Array.isArray(data.chronic_illnesses) ? data.chronic_illnesses.join(', ') : (data.chronic_illnesses || '');
        const setAllergies = document.getElementById('set-allergies');
        if (setAllergies) setAllergies.value = Array.isArray(data.allergies) ? data.allergies.join(', ') : (data.allergies || '');
        const setMeds = document.getElementById('set-meds');
        if (setMeds) setMeds.value = Array.isArray(data.current_medications) ? data.current_medications.join(', ') : (data.current_medications || '');
    }
}

// 2. Upload Record
async function uploadRecord() {
    const fileInput = document.getElementById('pdf-upload');
    const file = fileInput.files[0];
    if (!file) return showNotification("Please select a PDF file first", 'warning');

    const btn = document.getElementById('upload-btn');
    btn.disabled = true;
    btn.classList.add('loading');
    btn.innerText = "Uploading...";

    const fileName = `${Date.now()}_${file.name}`;
    const filePath = `${currentUser.id}/${fileName}`;

    // 1. Upload to Storage
    const { data: storageData, error: storageError } = await supabaseClient
        .storage
        .from('medical_records')
        .upload(filePath, file);

    if (storageError) {
        showNotification(storageError.message, "error");
        btn.disabled = false;
        btn.innerText = "Upload to Vault";
        return;
    }

    // --- STEP 2: ADD TO DATABASE TABLE ---
    const { error: dbError } = await supabaseClient
        .from('medical_records')
        .insert([{
            patient_id: currentUser.id,
            file_name: file.name,
            file_url: filePath
        }]);

    if (dbError) {
        console.error("Database Error:", dbError);
    // Delete the file from storage since db insert failed
    await supabaseClient.storage.from('medical_records').remove([filePath]);
        showNotification("Failed to save record: " + dbError.message, "error");
        fileInput.value = ""; // Clear the input
    } else {
        showNotification("Record saved successfully!", "success");
        fileInput.value = ""; // Clear the input
        loadRecords();       // Trigger your function that refreshes the table on screen
    }

    btn.disabled = false;
    btn.innerText = "Upload to Vault";
}

// 3. Load Records
async function loadRecords() {
    const recordList = document.getElementById('record-list');
    recordList.innerHTML = '<p>Loading records...</p>';

    // 1. Fetch records from the 'medical_records' table for this user
    const { data: records, error } = await supabaseClient
        .from('medical_records')
        .select('*')
        .eq('patient_id', currentUser.id)
        .order('upload_date', { ascending: false });

    console.log('Records fetched:', records);
    console.log('Error:', error);

    if (error) {
        recordList.innerHTML = `<p class="error">Error: ${error.message}</p>`;
        return;
    }

    if (!records || records.length === 0) {
        recordList.innerHTML = '<p>No records found. Upload your first document!</p>';
        return;
    }

    // 2. Build the list
    recordList.innerHTML = '';
    records.forEach(record => {
        const fileRow = document.createElement('div');
        fileRow.className = 'record-item card';
        fileRow.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <i class="fas fa-file-pdf"></i>
                    <strong>${record.file_name}</strong>
                    <small>(${new Date(record.upload_date).toLocaleDateString()})</small>
                </div>
                <div class="actions">
                    <button onclick="downloadFile('${record.file_url}')" class="btn-primary">Download</button>
                    <button onclick="deleteRecord('${record.id}', '${record.file_url}')" class="btn-danger">Delete</button>
                </div>
            </div>
        `;
        recordList.appendChild(fileRow);
    });
}

// Helper to Delete Record
async function deleteRecord(recordId, filePath) {
    // 1. Delete from Database Table
    const { error: dbError } = await supabaseClient
        .from('medical_records')
        .delete()
        .eq('id', recordId);

    if (dbError) return showNotification("Delete failed: " + dbError.message, "error");

    // 2. Delete from Storage Bucket
    const { error: storageError } = await supabaseClient
        .storage
        .from('medical_records')
        .remove([filePath]);

    loadRecords(); // Refresh the UI
    showNotification("Record fully removed", "success");
}

// Helper to Download File
async function downloadFile(fileUrl) {
    const { data, error } = await supabaseClient
        .storage
        .from('medical_records')
        .download(fileUrl);

    if (error) {
        showNotification("Error downloading file: " + error.message, "error");
        return;
    }

    // Create a download link
    const url = URL.createObjectURL(data);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileUrl.split('/').pop(); // Extract filename from path
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// 4. Load Logs (Audit Logs and Prescriptions)
async function loadLogs() {
    // Fetch Audit Logs
    const { data: logs, error: logsError } = await supabaseClient
        .from('audit_logs')
        .select('*, doctors(name)')
        .eq('patient_id', currentUser.id);

    if (logsError) console.error('Error loading audit logs:', logsError);

    // Sort logs by timestamp descending (most recent first)
    const sortedLogs = (logs || []).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

    const logsTbody = document.getElementById('logs-table-body');
    logsTbody.innerHTML = sortedLogs.map(log => `
        <tr style="border-bottom: 1px solid var(--border);">
            <td style="padding: 12px; text-align: left;">${log.doctor_id ? 'Dr. ' + (log.doctors?.name || 'Doctor') : 'System'}</td>
            <td style="padding: 12px; text-align: left;">${log.action}</td>
            <td style="padding: 12px; text-align: left;">${new Date(log.timestamp).toLocaleString()}</td>
        </tr>
    `).join('');

    // Fetch Prescriptions
    const { data: prescriptions, error: prescError } = await supabaseClient
        .from('prescriptions')
        .select('*, doctors(name)')
        .eq('patient_id', currentUser.id);

    if (prescError) console.error('Error loading prescriptions:', prescError);

    const prescList = document.getElementById('prescriptions-list');
    prescList.innerHTML = (prescriptions || []).length ? prescriptions.map(p => `
        <div style="border: 1px solid var(--border); padding: 10px; margin-bottom: 10px; border-radius: 8px;">
            <strong>${p.medication_name}</strong> - Dosage: ${p.dosage}, Duration: ${p.course_duration}<br>
            <small>Prescribed by Dr. ${p.doctors?.name || 'Unknown'} on ${new Date(p.date_prescribed).toLocaleDateString()}</small>
        </div>
    `).join('') : '<p>No prescriptions found.</p>';
}

// 5. Update Privacy & Profile
async function updatePrivacy() {
    const val = document.getElementById('privacy-toggle').value;
    const { error } = await supabaseClient.from('profiles').update({ record_visibility: val }).eq('id', currentUser.id);
    if (error) {
        showNotification("Error updating privacy: " + error.message, 'error');
    } else {
        showNotification("Privacy mode updated!", 'success');
    }
}

// Emergency contact validation - only allow digits
document.getElementById('set-emergency')?.addEventListener('input', (e) => {
    // Remove any non-digit characters
    e.target.value = e.target.value.replace(/\D/g, '');
    
    // Limit to 10 digits
    if (e.target.value.length > 10) {
        e.target.value = e.target.value.slice(0, 10);
    }
});

document.getElementById('update-info-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    // Clear any existing notifications
    const existingNotification = document.querySelector('.profile-notification');
    if (existingNotification) {
        existingNotification.remove();
    }

    const emergencyContact = document.getElementById('set-emergency').value;

    // Validate emergency contact
    if (emergencyContact && emergencyContact.length !== 10) {
        showNotification('Emergency contact must be exactly 10 digits', 'error');
        return;
    }

    const updates = {
        name: document.getElementById('set-name').value,
        age: parseInt(document.getElementById('set-age').value) || null,
        gender: document.getElementById('set-gender').value,
        blood_group: document.getElementById('set-blood').value,
        emergency_contact: emergencyContact || null,
        chronic_illnesses: document.getElementById('set-chronic').value ? document.getElementById('set-chronic').value.split(',').map(s => s.trim()) : [],
        allergies: document.getElementById('set-allergies').value ? document.getElementById('set-allergies').value.split(',').map(s => s.trim()) : [],
        current_medications: document.getElementById('set-meds').value ? document.getElementById('set-meds').value.split(',').map(s => s.trim()) : [],
    };

    const submitBtn = e.target.querySelector('button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.textContent = 'Updating...';
    submitBtn.disabled = true;

    const { error } = await supabaseClient.from('profiles').update(updates).eq('id', currentUser.id);

    submitBtn.textContent = originalText;
    submitBtn.disabled = false;

    if (!error) {
        showNotification("Profile updated successfully!", "success");
        loadProfileData();
    } else {
        showNotification(error.message, "error");
    }
});
