# 🏥 MediVault: Secure Role-Based Healthcare Ecosystem

**MediVault** is a high-integrity digital health platform designed to streamline clinical administration and empower patients with secure data ownership. Developed for **SAAVISHKAR 2026**, this project features AI-driven triage, atomic scheduling logic, and robust data isolation.

---

## 🤝 The Team

This project was built with by:

* **Pratik Satpute** - [@PratikS-1107](https://github.com/PratikS-1107)
* **Aastha Vyas** - [@aasthavyas704-hub](https://github.com/aasthavyas704-hub)
* **Samrudddhi Shewale** - [@samruddhishewale-2314](https://github.com/samruddhishewale-2314)

---

## 🚀 Key Features

* **🤖 AI-Powered Triage:** Integration with **Google Gemini 1.5 Flash** to translate unstructured patient symptoms into structured urgency reports (High/Medium/Low).
* **⚡ Atomic Booking Engine:** Advanced server-side **PostgreSQL Stored Procedures (RPC)** that handle concurrency, preventing overbooking and enforcing a strict 100-patient limit per shift.
* **🔐 High-Fidelity Security:** Implementation of **Row Level Security (RLS)** at the database level to ensure patients can only access their own records.
* **📅 Role-Based Dashboards:** Distinct, dynamic interfaces for:
    * **Patients:** Symptom checking, appointment booking, and medical record access.
    * **Doctors:** Real-time queue management, patient history, and e-prescriptions.
    * **Receptionists:** Shift scheduling, slot management, and manual booking overrides.
* **📂 Secure Document Management:** Encrypted PDF storage using **Supabase Storage Buckets** with time-limited signed URLs for viewing.

---

## 🛠️ Tech Stack

* **Frontend:** Vanilla JavaScript (ES6+), HTML5, CSS3 (Custom Variables)
* **Backend-as-a-Service:** [Supabase](https://supabase.com/) (PostgreSQL, GoTrue Auth, Realtime)
* **AI Layer:** Google Gemini 1.5 Flash API
* **Database Logic:** PL/pgSQL (Stored Procedures & Triggers)
* **Icons/Fonts:** FontAwesome 6, Google Fonts

---

## 📂 Project Structure

```text
├── images/               # UI Assets, Logos, and Diagrams
├── js/
│   ├── supabaseclient.js # Centralized Supabase configuration & Global helpers
│   ├── user.js           # Patient portal logic & AI Triage integration
│   ├── doctor.js         # Clinical queue & prescription management
│   ├── receptionist.js   # Slot creation & scheduling logic
│   └── login.js          # Auth handling & Metadata-based routing
├── index.html            # Entry point (Auth & Landing)
├── user.html             # Patient Dashboard
├── doctor.html           # Doctor Dashboard
├── receptionist.html     # Receptionist Dashboard
└── style.css             # Unified Design System
