/**
 * UI HELPER: Switch between Login and Signup forms
 */
function toggleView(mode) {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const tabLogin = document.getElementById('tab-login');
    const tabSignup = document.getElementById('tab-signup');
    const message = document.getElementById('message');

    message.innerHTML = ""; // Clear existing messages

    if (mode === 'login') {
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
        tabLogin.classList.add('active');
        tabSignup.classList.remove('active');
    } else {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        tabLogin.classList.remove('active');
        tabSignup.classList.add('active');
    }
}

/**
 * EMAIL VALIDATION HELPER
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

/**
 * SIGNUP LOGIC with Email Verification
 */
document.getElementById('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signup-email').value.trim();
    const password = document.getElementById('signup-password').value;
    const name = document.getElementById('signup-name').value;
    const role = document.getElementById('signup-role').value;
    const msg = document.getElementById('message');
    const submitBtn = e.target.querySelector('button');

    // Validate email format
    if (!isValidEmail(email)) {
        msg.innerText = "Please enter a valid email address.";
        msg.style.color = "red";
        return;
    }

    // Validate password strength
    if (password.length < 6) {
        msg.innerText = "Password must be at least 6 characters long.";
        msg.style.color = "red";
        return;
    }

    // UI State: Processing
    msg.innerText = "Checking email availability...";
    msg.style.color = "#555";
    submitBtn.disabled = true;

    // 1. Check if user already exists by attempting sign in
    const { error: signInError } = await supabaseClient.auth.signInWithPassword({
        email,
        password
    });

    let userExists = false;
    if (signInError) {
        if (signInError.message.includes("Invalid login credentials")) {
            // User does not exist, proceed with signup
            userExists = false;
        } else if (signInError.message.includes("Email not confirmed") || signInError.message.includes("not confirmed")) {
            // User exists but not confirmed
            userExists = true;
        } else {
            // Other error, assume user exists to be safe
            userExists = true;
        }
    } else {
        // Sign in succeeded, user definitely exists
        userExists = true;
    }

    if (userExists) {
        // Email already exists - show login/reset options
        msg.innerHTML = `
            <div class="warning-notification" style="background: #fefce8; border: 1px solid #fde047; color: #a16207; padding: 15px; border-radius: 8px; margin-top: 15px;">
                <h4 style="margin: 0 0 10px 0; color: #a16207;">⚠️ Email Already Registered</h4>
                <p style="margin: 0 0 15px 0; font-size: 0.9rem;">An account with this email already exists. Please login or reset your password.</p>
                <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                    <button onclick="toggleView('login')" class="btn-reset" style="background: #059669; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9rem;">
                        Login Instead
                    </button>
                    <button onclick="sendPasswordReset('${email.replace(/'/g, "\\'")}')" class="btn-reset" style="background: #f59e0b; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9rem;">
                        Reset Password
                    </button>
                </div>
            </div>
        `;
        submitBtn.disabled = false;
        return;
    }

    // 2. Proceed with signup since email doesn't exist
    msg.innerText = "Creating your vault...";
    const { data, error } = await supabaseClient.auth.signUp({
        email,
        password,
        options: {
            // Metadata is stored in auth.users and can be used for redirection after login
            data: { name, role },
            // Ensure the user is sent back to your login page after clicking the email link
            emailRedirectTo: window.location.origin + '/index.html'
        }
    });

    if (error) {
        msg.innerHTML = `
            <div class="error-notification" style="background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 15px; border-radius: 8px; margin-top: 15px;">
                <h4 style="margin: 0 0 5px 0; color: #dc2626;">❌ Signup Failed</h4>
                <p style="margin: 0; font-size: 0.9rem;">${error.message}</p>
            </div>
        `;
        submitBtn.disabled = false;
    } else {
        // Note: Profile creation is now handled after email verification during first login
        // This avoids RLS policy conflicts during the signup process

        // 3. Clear form and show Verification Instruction
        document.getElementById('signup-form').reset();
        document.getElementById('signup-form').classList.add('hidden');

        msg.innerHTML = `
            <div class="success-notification" style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 20px; border-radius: 8px; margin-top: 15px;">
                <h3 style="color: #166534; margin-top: 0;">✅ Account Created Successfully!</h3>
                <p style="margin: 10px 0;">We've sent a verification link to <strong>${email}</strong>.</p>
                <div style="background: #ecfdf5; padding: 15px; border-radius: 6px; margin-top: 15px;">
                    <h4 style="margin: 0 0 10px 0; color: #166534;">📧 Next Steps:</h4>
                    <ol style="margin: 0; padding-left: 20px;">
                        <li>Check your email inbox (and spam folder)</li>
                        <li>Click the verification link in the email</li>
                        <li>Return here to <a href="#" onclick="toggleView('login')" style="color: #166534; text-decoration: underline;">login</a> with your credentials</li>
                    </ol>
                </div>
            </div>
        `;
    }
});

/**
 * PASSWORD RESET HELPER
 */
async function sendPasswordReset(email) {
    const msg = document.getElementById('message');
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin + '/index.html'
    });

    if (error) {
        msg.innerHTML = `
            <div class="error-notification" style="background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 15px; border-radius: 8px; margin-top: 15px;">
                <h4 style="margin: 0 0 5px 0; color: #dc2626;">❌ Password Reset Failed</h4>
                <p style="margin: 0; font-size: 0.9rem;">${error.message}</p>
            </div>
        `;
    } else {
        msg.innerHTML = `
            <div class="success-notification" style="background: #f0fdf4; border: 1px solid #bbf7d0; color: #166534; padding: 15px; border-radius: 8px; margin-top: 15px;">
                <h4 style="margin: 0 0 5px 0; color: #166534;">✅ Password Reset Email Sent</h4>
                <p style="margin: 0; font-size: 0.9rem;">Check your email for instructions to reset your password.</p>
            </div>
        `;
    }
}

/**
 * LOGIN LOGIC
 */
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const msg = document.getElementById('message');

    // Validate email format
    if (!isValidEmail(email)) {
        msg.innerText = "Please enter a valid email address.";
        msg.style.color = "red";
        return;
    }

    msg.innerText = "Checking credentials...";

    try {
        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email.trim(),
            password: password
        });

        if (error) {
            msg.style.color = "red";

            // Handle specific error cases with better error messages
            if (error.message.includes("Email not confirmed") || error.message.includes("not confirmed")) {
                msg.innerHTML = `
                    <div class="error-notification" style="background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; padding: 15px; border-radius: 8px; margin-top: 15px;">
                        <h4 style="margin: 0 0 10px 0; color: #dc2626;">📧 Email Not Verified</h4>
                        <p style="margin: 0 0 15px 0; font-size: 0.9rem;">Please check your email and click the verification link before logging in.</p>
                        <button onclick="sendPasswordReset('${email.replace(/'/g, "\\'")}')" class="btn-reset" style="background: #f59e0b; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-size: 0.9rem;">
                            Resend Verification Email
                        </button>
                    </div>
                `;
            } else if (error.message.includes("Invalid login credentials") || error.message.includes("invalid_credentials")) {
                msg.innerText = "Invalid email or password. Please check your credentials and try again.";
            } else if (error.message.includes("Too many requests") || error.message.includes("rate_limit")) {
                msg.innerText = "Too many login attempts. Please wait a few minutes before trying again.";
            } else if (error.message.includes("Email link is invalid") || error.message.includes("expired")) {
                msg.innerText = "Your verification link has expired. Please request a new one.";
            } else {
                console.error('Login error:', error);
                msg.innerText = "Login failed. Please try again or contact support if the problem persists.";
            }
        } else {
            // Validate user data
            if (!data.user) {
                msg.innerText = "Login failed: Invalid response from server.";
                msg.style.color = "red";
                return;
            }

            // Check if user has user_metadata
            if (!data.user.user_metadata || !data.user.user_metadata.role) {
                msg.innerText = "Account setup incomplete. Please contact support.";
                msg.style.color = "red";
                return;
            }

            // Check if profile exists, create if not (first login after email verification)
            const { data: existingProfile, error: profileCheckError } = await supabaseClient
                .from('profiles')
                .select('*')
                .eq('id', data.user.id)
                .single();

            if (profileCheckError && profileCheckError.code !== 'PGRST116') {
                // Error other than "not found"
                msg.innerText = "Error checking profile. Please try again.";
                msg.style.color = "red";
                return;
            }

            // Create profile if it doesn't exist
            if (!existingProfile) {
                const userRole = data.user.user_metadata.role;
                const userName = data.user.user_metadata.name;

                const { error: createProfileError } = await supabaseClient
                    .from('profiles')
                    .insert([{
                        id: data.user.id,
                        name: userName,
                        role: userRole,
                        record_visibility: 'private'
                    }]);

                if (createProfileError) {
                    msg.innerText = "Error creating profile. Please contact support.";
                    msg.style.color = "red";
                    return;
                }

                // Create doctor entry if role is doctor
                if (userRole === 'doctor') {
                    const { error: doctorError } = await supabaseClient
                        .from('doctors')
                        .insert([{ id: data.user.id, name: userName }]);

                    if (doctorError) {
                        console.error('Failed to create doctor profile:', doctorError);
                        // Don't fail login for this
                    }
                }
            }

            // Success - redirect based on role
            const userRole = data.user.user_metadata.role;
            msg.innerText = "Login successful! Redirecting...";
            msg.style.color = "green";

            // Small delay to show success message
            setTimeout(() => {
                if (userRole === 'doctor') {
                    window.location.href = 'doctor.html';
                } else if (userRole === 'receptionist') {
                    window.location.href = 'receptionist.html';
                } else {
                    window.location.href = 'user.html';
                }
            }, 500);
        }
    } catch (networkError) {
        console.error('Network error during login:', networkError);
        msg.innerText = "Network error. Please check your connection and try again.";
        msg.style.color = "red";
    }
});
