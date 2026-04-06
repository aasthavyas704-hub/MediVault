let currentReceptionist = null;
let slotRefreshInterval = null;

document.addEventListener('DOMContentLoaded', async () => {
    currentReceptionist = await checkAuth();
    if (!currentReceptionist) return;

    if (currentReceptionist.user_metadata.role === 'doctor') {
        window.location.href = 'doctor.html';
        return;
    }
    if (currentReceptionist.user_metadata.role === 'patient') {
        window.location.href = 'user.html';
        return;
    }
    if (currentReceptionist.user_metadata.role !== 'receptionist') {
        window.location.href = 'index.html';
        return;
    }

    setupTabSwitching();
    await loadDoctors();
    await loadSlots();
    await loadAppointments();
    setupForms();
    
    // Start auto-refresh for slots every 30 seconds
    startSlotAutoRefresh();
});

function startSlotAutoRefresh() {
    // Refresh slots every 30 seconds
    slotRefreshInterval = setInterval(() => {
        loadSlots().catch(err => console.error('Auto-refresh slots failed:', err));
    }, 30000);
}

function stopSlotAutoRefresh() {
    if (slotRefreshInterval) {
        clearInterval(slotRefreshInterval);
        slotRefreshInterval = null;
    }
}

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
            const targetSection = document.getElementById(target);
            if (targetSection) targetSection.classList.remove('hidden');
        });
    });
}

function setupForms() {
    const appointmentForm = document.getElementById('appointment-form');
    if (appointmentForm) {
        appointmentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleAppointmentFormSubmit();
        });
    }

    // Patient search functionality
    const searchPatientBtn = document.getElementById('search-patient-btn');
    if (searchPatientBtn) {
        searchPatientBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            await searchPatientByName();
        });
    }

    const clearPatientBtn = document.getElementById('clear-patient-btn');
    if (clearPatientBtn) {
        clearPatientBtn.addEventListener('click', (e) => {
            e.preventDefault();
            clearPatientSearch();
        });
    }

    const doctorSelect = document.getElementById('doctor-select');
    const appointmentDate = document.getElementById('appointment-date');
    if (doctorSelect) doctorSelect.addEventListener('change', loadReceptionistAvailableSlots);
    if (appointmentDate) appointmentDate.addEventListener('change', loadReceptionistAvailableSlots);

    const createSlotForm = document.getElementById('create-slot-form');
    if (createSlotForm) {
        createSlotForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await handleCreateSlotFormSubmit();
        });
    }

    // Setup hour/minute input validation for 12-hour time
    const timeInputs = [
        'slot-start-hour', 'slot-start-minute',
        'slot-end-hour', 'slot-end-minute'
    ];

    timeInputs.forEach(inputId => {
        const input = document.getElementById(inputId);
        if (input) {
            input.addEventListener('change', () => {
                // Pad with zeros and validate
                if (inputId.includes('hour')) {
                    input.value = input.value ? String(Math.min(12, Math.max(1, Number(input.value)))).padStart(2, '0') : '';
                } else if (inputId.includes('minute')) {
                    input.value = input.value ? String(Math.min(59, Math.max(0, Number(input.value)))).padStart(2, '0') : '';
                }
            });
        }
    });
}

async function loadReceptionistAvailableSlots() {
    const doctorId = document.getElementById('doctor-select')?.value;
    const appointmentDate = document.getElementById('appointment-date')?.value;
    const slotSelect = document.getElementById('appointment-slot-select');
    const slotInfo = document.getElementById('appointment-slot-info');

    if (!doctorId || !appointmentDate) {
        if (slotSelect) slotSelect.innerHTML = '<option value="">Select Doctor & Date first</option>';
        if (slotInfo) slotInfo.innerText = 'Choose a doctor and date to see available slots.';
        return;
    }

    const { data: slots, error } = await supabaseClient
        .from('doctor_availability')
        .select('*')
        .eq('doctor_id', doctorId)
        .eq('available_date', appointmentDate)
        .order('start_time', { ascending: true });

    if (error) {
        console.error('Error loading slots:', error);
        if (slotInfo) slotInfo.innerText = 'Error loading available slots.';
        return;
    }

    const availableSlots = (slots || []).filter(s => s.current_bookings < s.max_capacity);

    if (availableSlots.length === 0) {
        if (slotSelect) slotSelect.innerHTML = '<option value="">No available slots for this date</option>';
        if (slotInfo) slotInfo.innerText = 'No available slots for this doctor and date. Please select another date.';
        return;
    }

    if (slotSelect) {
        slotSelect.innerHTML = '<option value="">Select a Time Slot</option>' + availableSlots.map(slot => {
            const free = slot.max_capacity - slot.current_bookings;
            return `<option value="${slot.id}">${slot.start_time} - ${slot.end_time} (${free}/${slot.max_capacity} available)</option>`;
        }).join('');
    }

    if (slotInfo) {
        const totalAvailable = availableSlots.reduce((sum, s) => sum + Math.max(0, s.max_capacity - s.current_bookings), 0);
        slotInfo.innerText = `Showing ${availableSlots.length} available slot(s), ${totalAvailable} total spots available`;
    }
}

async function loadAppointments() {
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toISOString();
    const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1).toISOString();

    const { data: appointments, error } = await supabaseClient
        .from('appointments')
        .select('*')
        .gte('appointment_time', startOfDay)
        .lt('appointment_time', endOfDay)
        .order('appointment_time', { ascending: true });

    if (error) {
        console.error('Error loading appointments:', error);
        showNotification('Could not load today appointments. Please refresh.', 'error');
    }

    const aptList = appointments || [];

    const patientIds = [...new Set(aptList.map(apt => apt.patient_id).filter(Boolean))];
    const doctorIds = [...new Set(aptList.map(apt => apt.doctor_id).filter(Boolean))];

    let patients = [];
    let doctors = [];

    if (patientIds.length) {
        const { data, error: pError } = await supabaseClient
            .from('profiles')
            .select('id, name')
            .in('id', patientIds);
        if (pError) console.error('Error loading patients:', pError);
        patients = data || [];
    }

    if (doctorIds.length) {
        const { data, error: dError } = await supabaseClient
            .from('doctors')
            .select('id, name')
            .in('id', doctorIds);
        if (dError) console.error('Error loading doctors for map:', dError);
        doctors = data || [];
    }

    const patientMap = {};
    patients.forEach(p => { if (p?.id) patientMap[p.id] = p.name; });

    const doctorMap = {};
    doctors.forEach(d => { if (d?.id) doctorMap[d.id] = d.name; });

    const appointmentsList = document.getElementById('appointments-list');
    if (!appointmentsList) return;

    appointmentsList.innerHTML = aptList.length ? aptList.map(apt => `
        <div class="appointment-item" style="border: 1px solid var(--border); padding: 10px; margin-bottom: 10px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
            <div>
                <strong>${new Date(apt.appointment_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${patientMap[apt.patient_id] || 'Patient'}</strong> with Dr. ${doctorMap[apt.doctor_id] || 'Doctor'}
                <p>Status: ${apt.status || 'scheduled'}</p>
            </div>
            ${apt.status === 'scheduled' ? `<button class="btn-danger" style="padding: 6px 12px; font-size: 0.85rem;" data-cancel-apt-id="${apt.id}">Cancel</button>` : ''}
        </div>
    `).join('') : '<p>No appointments for today.</p>';

    // Add event listeners for cancel buttons
    appointmentsList.querySelectorAll('button[data-cancel-apt-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const aptId = btn.getAttribute('data-cancel-apt-id');
            if (aptId) await receptionistCancelAppointment(aptId);
        });
    });
}

async function loadDoctors() {
    const { data: doctors, error } = await supabaseClient
        .from('doctors')
        .select('*');

    if (error) {
        console.error('Error loading doctors:', error);
        showNotification('Could not load doctors list. Please try again.', 'error');
    }

    const doctorSelect = document.getElementById('doctor-select');
    const slotDoctorSelect = document.getElementById('slot-doctor-select');

    const options = (doctors || []).map(doc => `<option value="${doc.id}">${doc.name}</option>`).join('');

    if (doctorSelect) doctorSelect.innerHTML = '<option value="">Select Doctor</option>' + options;
    if (slotDoctorSelect) slotDoctorSelect.innerHTML = '<option value="">Select Doctor</option>' + options;
}

async function loadSlots() {
    // Show loading indicator on refresh button
    const refreshBtn = document.getElementById('refresh-slots-btn');
    if (refreshBtn) {
        refreshBtn.disabled = true;
        refreshBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
    }

    const { data: slots, error } = await supabaseClient
        .from('doctor_availability')
        .select('*')
        .order('available_date', { ascending: true })
        .order('start_time', { ascending: true });

    if (error) {
        console.error('Error loading availability slots:', error);
        showNotification('Could not load availability slots. Please refresh.', 'error');
    }

    const slotsList = document.getElementById('slots-list');
    if (!slotsList) {
        // Restore button state if early exit
        if (refreshBtn) {
            refreshBtn.disabled = false;
            refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
        }
        return;
    }

    const doctorIds = [...new Set((slots || []).map(s => s.doctor_id))];
    const { data: doctors } = await supabaseClient
        .from('doctors')
        .select('id,name')
        .in('id', doctorIds);

    const doctorMap = {};
    doctors?.forEach(doc => { if (doc?.id) doctorMap[doc.id] = doc.name; });

    const slotItems = (slots || []).map(slot => {
        const doctorName = doctorMap[slot.doctor_id] || 'Unknown';
        const date = slot.available_date ? new Date(slot.available_date).toLocaleDateString() : slot.available_date;
        const available = Math.max(0, (slot.max_capacity || 0) - (slot.current_bookings || 0));
        const isFull = available === 0;
        const slotBgColor = isFull ? '#fee' : 'transparent';
        const slotBorderColor = isFull ? '#fcc' : 'var(--border)';
        const availableTextColor = isFull ? '#d32f2f' : '#388e3c';
        
        return `
            <div class="slot-item" style="border: 1px solid ${slotBorderColor}; padding: 10px; margin-bottom: 8px; border-radius: 8px; display: flex; justify-content: space-between; align-items: center; background: ${slotBgColor};">
                <div>
                    <strong>Dr. ${doctorName}</strong>
                    <div>${date} ${slot.start_time || ''} - ${slot.end_time || ''}</div>
                    <div style="font-weight: 500;">Capacity: <span style="color: var(--primary);">${slot.max_capacity || 0}</span> | Booked: <span style="color: var(--text-muted);">${slot.current_bookings || 0}</span> | Available: <span style="color: ${availableTextColor}; font-weight: bold;">${available}</span></div>
                </div>
                <div style="display:flex; gap:8px;">
                    <button class="btn-secondary" style="font-size:0.8rem; padding:6px 12px;" data-edit-slot-id="${slot.id}">Edit</button>
                    <button class="btn-danger" style="font-size:0.8rem; padding:6px 12px;" data-slot-id="${slot.id}">Delete</button>
                </div>
            </div>
        `;
    }).join('');

    slotsList.innerHTML = slotItems || '<p>No time slots created yet.</p>';

    slotsList.querySelectorAll('button[data-slot-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const slotId = btn.getAttribute('data-slot-id');
            if (!slotId) return;
            const confirmDelete = confirm('Delete this availability slot?');
            if (!confirmDelete) return;
            const { error } = await supabaseClient.from('doctor_availability').delete().eq('id', slotId);
            if (error) {
                console.error('Error deleting slot:', error);
                showNotification('Cannot delete slot: ' + error.message, 'error');
            } else {
                showNotification('Slot deleted.', 'success');
                loadSlots();
            }
        });
    });

    slotsList.querySelectorAll('button[data-edit-slot-id]').forEach(btn => {
        btn.addEventListener('click', async () => {
            const slotId = btn.getAttribute('data-edit-slot-id');
            if (!slotId) return;

            const { data: slot, error } = await supabaseClient.from('doctor_availability').select('*').eq('id', slotId).single();
            if (error || !slot) {
                showNotification('Unable to load slot details for edit.', 'error');
                return;
            }

            const newStart = prompt('Start Time (HH:MM)', slot.start_time);
            if (newStart === null) return;
            const newEnd = prompt('End Time (HH:MM)', slot.end_time);
            if (newEnd === null) return;
            const newCapacity = prompt('Max Capacity', slot.max_capacity);
            if (newCapacity === null) return;

            const parsedCapacity = Number(newCapacity);
            if (!newStart || !newEnd || Number.isNaN(parsedCapacity) || parsedCapacity < 1) {
                showNotification('Invalid input for editing slot.', 'warning');
                return;
            }

            if (newStart >= newEnd) {
                showNotification('Start time must be before end time.', 'error');
                return;
            }

            if (parsedCapacity < slot.current_bookings) {
                showNotification('Capacity cannot be lower than current bookings.', 'warning');
                return;
            }

            const { error: updateError } = await supabaseClient.from('doctor_availability').update({
                start_time: newStart,
                end_time: newEnd,
                max_capacity: parsedCapacity
            }).eq('id', slotId);

            if (updateError) {
                console.error('Error updating slot:', updateError);
                showNotification('Failed to update slot.', 'error');
            } else {
                showNotification('Slot updated.', 'success');
                loadSlots();
            }
        });
    });

    // Restore refresh button to normal state
    if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.innerHTML = '<i class="fas fa-sync-alt"></i> Refresh';
    }
}

async function handleAppointmentFormSubmit() {
    const patientName = document.getElementById('patient-name')?.value?.trim();
    const patientId = document.getElementById('patient-id-field')?.value; // Get patient_id if found
    const doctorId = document.getElementById('doctor-select')?.value;
    const appointmentDate = document.getElementById('appointment-date')?.value;
    const selectedSlotId = document.getElementById('appointment-slot-select')?.value;
    const reason = document.getElementById('appointment-reason')?.value;

    if (!patientName || !doctorId || !appointmentDate || !selectedSlotId) {
        showNotification('Please fill all required appointment fields and select a time slot.', 'warning');
        return;
    }

    // Fetch the selected slot to get exact time and validate
    const { data: slot, error: slotError } = await supabaseClient
        .from('doctor_availability')
        .select('*')
        .eq('id', selectedSlotId)
        .single();

    if (slotError || !slot) {
        showNotification('Selected slot is invalid or no longer available.', 'error');
        loadReceptionistAvailableSlots();
        return;
    }

    if (slot.current_bookings >= slot.max_capacity) {
        showNotification('This slot is now full. Please select another.', 'error');
        loadReceptionistAvailableSlots();
        return;
    }

    // CHECK FOR DUPLICATE BOOKING: If patient found in system, ensure they don't already have an appointment in this slot
    if (patientId) {
        const { data: existingAppointment, error: checkError } = await supabaseClient
            .from('appointments')
            .select('id')
            .eq('slot_id', selectedSlotId)
            .eq('patient_id', patientId)
            .eq('status', 'scheduled')
            .single();

        if (existingAppointment) {
            showNotification('This patient already has an appointment in this slot. Please select a different slot.', 'warning');
            return;
        }
    }

    const appointmentTimeISO = new Date(`${slot.available_date}T${slot.start_time}`).toISOString();

    // Create appointment - include patient_id if a patient was found
    const appointmentData = {
        patient_name: patientName,
        doctor_id: doctorId,
        appointment_time: appointmentTimeISO,
        reason: reason || null,
        status: 'scheduled',
        slot_id: selectedSlotId
    };

    // Add patient_id only if a patient was found in the search
    if (patientId) {
        appointmentData.patient_id = patientId;
    }

    const { data, error } = await supabaseClient.from('appointments').insert([appointmentData]);

    if (error) {
        console.error('Error creating appointment:', error);
        showNotification('Failed to create appointment: ' + error.message, 'error');
        return;
    }

    // Increment slot booking count (should be single increment now)
    const { error: updateError } = await supabaseClient
        .from('doctor_availability')
        .update({ current_bookings: (slot.current_bookings || 0) + 1 })
        .eq('id', selectedSlotId);

    if (updateError) {
        console.error('Error updating slot bookings:', updateError);
        showNotification('Appointment created but slot update failed: ' + error.message, 'warning');
    } else {
        console.log('✓ Successfully updated slot booking count');
        showNotification('Appointment created successfully.', 'success');
    }

    document.getElementById('appointment-form')?.reset();
    clearPatientSearch(); // Clear patient search fields
    await loadAppointments();
    await loadReceptionistAvailableSlots();
    await loadSlots();
}

// Patient search by name
async function searchPatientByName() {
    const nameSearch = document.getElementById('patient-name-search')?.value?.trim();
    const searchStatus = document.getElementById('search-status');

    if (!nameSearch) {
        showNotification('Please enter a patient name', 'warning');
        return;
    }

    searchStatus.innerText = 'Searching...';

    // Search for patient by name in profiles table (case-insensitive) - only patients with 'patient' role
    const { data: patients, error } = await supabaseClient
        .from('profiles')
        .select('id, name')
        .ilike('name', `%${nameSearch}%`)
        .eq('role', 'patient')
        .limit(5);

    if (error) {
        console.error('Error searching patient:', error);
        searchStatus.innerText = '❌ Search error. Please try again.';
        showNotification('Failed to search patient: ' + error.message, 'error');
        return;
    }

    if (!patients || patients.length === 0) {
        searchStatus.innerText = '❌ No patient found with this name. Please enter name manually.';
        clearPatientSearch();
        return;
    }

    if (patients.length === 1) {
        // Exact match - display patient details
        displayFoundPatient(patients[0]);
    } else {
        // Multiple matches - show dropdown to select
        showPatientMatches(patients);
    }
}

function displayFoundPatient(patient) {
    const detailsBox = document.getElementById('patient-details-box');
    const searchStatus = document.getElementById('search-status');
    const patientIdField = document.getElementById('patient-id-field');
    const patientNameField = document.getElementById('patient-name');

    // Display patient details
    document.getElementById('found-patient-name').innerText = patient.name || 'Unknown';
    document.getElementById('found-patient-uuid').innerText = patient.id;

    // Set hidden patient_id field
    patientIdField.value = patient.id;

    // Auto-fill patient name
    patientNameField.value = patient.name || '';

    // Show the details box
    detailsBox.style.display = 'block';
    searchStatus.innerText = '✅ Patient found! Details are displayed below.';

    showNotification(`Patient "${patient.name}" found!`, 'success');
}

function showPatientMatches(patients) {
    const searchStatus = document.getElementById('search-status');
    const detailsBox = document.getElementById('patient-details-box');

    // Create a temporary dropdown or list for selection
    let matchesHTML = '<div style="background: white; border: 1px solid var(--border); border-radius: 6px; max-height: 200px; overflow-y: auto;">';
    patients.forEach(patient => {
        matchesHTML += `<div style="padding: 10px; border-bottom: 1px solid #eee; cursor: pointer;" onclick="selectPatientFromMatches('${patient.id}', '${patient.name}')">${patient.name}</div>`;
    });
    matchesHTML += '</div>';

    searchStatus.innerHTML = `${patients.length} matches found. Click to select:`;
    detailsBox.innerHTML = matchesHTML;
    detailsBox.style.display = 'block';
}

function selectPatientFromMatches(patientId, patientName) {
    const testPatient = { id: patientId, name: patientName };
    displayFoundPatient(testPatient);
}

function clearPatientSearch() {
    document.getElementById('patient-name-search').value = '';
    document.getElementById('patient-id-field').value = '';
    document.getElementById('patient-name').value = '';
    document.getElementById('patient-details-box').style.display = 'none';
    document.getElementById('search-status').innerText = '';
}

async function handleCreateSlotFormSubmit() {
    const doctorId = document.getElementById('slot-doctor-select')?.value;
    const slotDate = document.getElementById('slot-date')?.value;
    const startHourInput = document.getElementById('slot-start-hour')?.value;
    const startMinuteInput = document.getElementById('slot-start-minute')?.value;
    const startPeriod = document.getElementById('slot-start-period')?.value || 'AM';
    const endHourInput = document.getElementById('slot-end-hour')?.value;
    const endMinuteInput = document.getElementById('slot-end-minute')?.value;
    const endPeriod = document.getElementById('slot-end-period')?.value || 'AM';
    const capacity = Number(document.getElementById('slot-capacity')?.value || 1);

    // Validate all fields (check for empty strings, not just falsy values)
    if (!doctorId || !slotDate || startHourInput === '' || startMinuteInput === '' || endHourInput === '' || endMinuteInput === '' || !capacity) {
        showNotification('Please fill all required slot details.', 'warning');
        return;
    }

    const startHour = Number(startHourInput);
    const startMinute = Number(startMinuteInput);
    const endHour = Number(endHourInput);
    const endMinute = Number(endMinuteInput);

    // Validate hour and minute ranges
    if (startHour < 1 || startHour > 12 || endHour < 1 || endHour > 12) {
        showNotification('Hour must be between 1 and 12.', 'error');
        return;
    }

    if (startMinute < 0 || startMinute > 59 || endMinute < 0 || endMinute > 59) {
        showNotification('Minutes must be between 0 and 59.', 'error');
        return;
    }

    // Convert 12-hour format to 24-hour format
    const startTime24 = convertTo24Hour(startHour, startMinute, startPeriod);
    const endTime24 = convertTo24Hour(endHour, endMinute, endPeriod);

    if (startTime24 >= endTime24) {
        showNotification('Start time must be before end time.', 'error');
        return;
    }

    const { data: selectedDoctor, error: doctorError } = await supabaseClient
        .from('doctors')
        .select('name')
        .eq('id', doctorId)
        .single();

    if (doctorError) {
        console.error('Error fetching doctor name:', doctorError);
        showNotification('Failed to fetch doctor details.', 'error');
        return;
    }

    const { error } = await supabaseClient.from('doctor_availability').insert([{
        doctor_id: doctorId,
        available_date: slotDate,
        start_time: startTime24,
        end_time: endTime24,
        max_capacity: capacity,
        current_bookings: 0,
        created_at: new Date().toISOString()
    }]);

    if (error) {
        console.error('Error creating slot:', error);
        showNotification('Failed to create slot: ' + error.message, 'error');
    } else {
        showNotification('Time slot created successfully.', 'success');
        document.getElementById('create-slot-form')?.reset();
        // Reset AM/PM selectors to AM
        document.getElementById('slot-start-period').value = 'AM';
        document.getElementById('slot-end-period').value = 'AM';
        await loadSlots();
    }
}

// Helper function to convert 12-hour format to 24-hour format (HH:MM)
function convertTo24Hour(hour12, minute, period) {
    let hour24 = hour12;

    if (period === 'PM' && hour12 !== 12) {
        hour24 = hour12 + 12;
    } else if (period === 'AM' && hour12 === 12) {
        hour24 = 0;
    }

    return `${String(hour24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// Receptionist appointment cancellation
async function receptionistCancelAppointment(appointmentId) {
    const confirmed = confirm('Are you sure you want to cancel this appointment?');
    if (!confirmed) return;

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

    // STEP 4: Refresh both appointments and slots display
    await loadAppointments();
    await loadSlots();
}

