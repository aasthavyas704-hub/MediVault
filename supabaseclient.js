// 1. Configuration - Replace these with your actual Supabase Project details
// You can find these in Supabase -> Settings -> API
const SUPABASE_URL = "https://jvhzvsnnfyqplyussuju.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_LhWzeo3ULeBZLhIv2ShAPg_8GeJ5wU0";

// 2. Initialize the Supabase Client
// Note: This assumes you have included the Supabase CDN in your HTML files
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function showNotification(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: 'fa-check-circle',
        error: 'fa-exclamation-circle',
        info: 'fa-info-circle'
    };

    // Added a close button (fa-times)
    toast.innerHTML = `
        <i class="fas ${icons[type] || 'fa-info-circle'}"></i>
        <div style="flex-grow: 1; padding-right: 10px;">${message}</div>
        <i class="fas fa-times" style="cursor: pointer; opacity: 0.5;" onclick="this.parentElement.remove()"></i>
    `;

    container.appendChild(toast);

    // Auto-remove after 5 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(20px)';
            toast.style.transition = 'opacity 0.5s ease, transform 0.5s ease';

            // Wait for the fade out to finish before removing from DOM
            setTimeout(() => {
                if (toast.parentNode) toast.remove();
            }, 500);
        }
    }, 5000);
}

/**
 * AUTH HELPER: Check if a user is logged in and return their data.
 * Redirects to login page if no session is found.
 */
async function checkAuth() {
    const { data: { session }, error } = await supabaseClient.auth.getSession();

    if (error || !session) {
        console.log("No active session found, redirecting to login...");
        window.location.href = "index.html";
        return null;
    }

    return session.user;
}

/**
 * ROLE HELPER: Verifies if the logged-in user matches the required role.
 * Prevents patients from accessing doctor.html and vice-versa.
 */
async function verifyRole(requiredRole) {
    const user = await checkAuth();
    if (!user) return;

    const userRole = user.user_metadata.role;

    if (userRole !== requiredRole) {
        alert("Unauthorized access! Redirecting to your dashboard.");
        window.location.href = userRole === 'doctor' ? 'doctor.html' : 'user.html';
    }
    
    return user;
}

/**
 * LOGOUT HELPER: Clears session and moves to login
 */
async function logout() {
    const { error } = await supabaseClient.auth.signOut();
    if (error) showNotification("Error logging out: " + error.message, 'error');
    window.location.href = "index.html";
}
