const form = document.querySelector("#auth-form");
const loginTab = document.querySelector("#login-tab");
const registerTab = document.querySelector("#register-tab");
const switchModeButton = document.querySelector("#switch-mode");
const nameField = document.querySelector("#name-field");
const confirmField = document.querySelector("#confirm-field");
const roleField = document.querySelector("#role-field");
const nameInput = document.querySelector("#full-name");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const confirmInput = document.querySelector("#confirm-password");
const title = document.querySelector("#form-title");
const eyebrow = document.querySelector("#form-eyebrow");
const subtitle = document.querySelector("#form-subtitle");
const submitButton = document.querySelector("#submit-button");
const switchCopy = document.querySelector("#switch-copy");
const message = document.querySelector("#form-message");

let mode = "login";

function setMode(nextMode) {
  mode = nextMode;
  const registering = mode === "register";

  nameField.classList.toggle("hidden", !registering);
  confirmField.classList.toggle("hidden", !registering);
  roleField.classList.toggle("hidden", !registering);
  loginTab.classList.toggle("active", !registering);
  registerTab.classList.toggle("active", registering);
  loginTab.setAttribute("aria-selected", String(!registering));
  registerTab.setAttribute("aria-selected", String(registering));

  eyebrow.textContent = registering ? "انضم إلى BBen" : "مرحباً بعودتك";
  title.textContent = registering ? "إنشاء حساب جديد" : "تسجيل الدخول";
  subtitle.textContent = registering
    ? "أنشئ حسابك وحدد كيف تريد استخدام BBen."
    : "أدخل بياناتك للمتابعة إلى حسابك.";
  submitButton.innerHTML = registering
    ? 'إنشاء الحساب <span aria-hidden="true">←</span>'
    : 'تسجيل الدخول <span aria-hidden="true">←</span>';
  switchCopy.firstChild.textContent = registering ? "عندك حساب بالفعل؟ " : "ما عندك حساب؟ ";
  switchModeButton.textContent = registering ? "سجّل الدخول" : "أنشئ حساباً جديداً";
  passwordInput.setAttribute("autocomplete", registering ? "new-password" : "current-password");
  clearErrors();
  message.textContent = "";
  message.className = "form-message";
}

function clearErrors() {
  document.querySelectorAll(".field-error").forEach((element) => { element.textContent = ""; });
  document.querySelectorAll(".field input").forEach((element) => element.removeAttribute("aria-invalid"));
}

function showError(input, errorId, text) {
  input.setAttribute("aria-invalid", "true");
  document.querySelector("#" + errorId).textContent = text;
}

function validate() {
  clearErrors();
  let valid = true;

  if (mode === "register" && nameInput.value.trim().length < 2) {
    showError(nameInput, "name-error", "اكتب اسمك الكامل.");
    valid = false;
  }

  const email = emailInput.value.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    showError(emailInput, "email-error", "أدخل بريداً إلكترونياً صحيحاً.");
    valid = false;
  }

  if (passwordInput.value.length < 8) {
    showError(passwordInput, "password-error", "كلمة المرور يجب أن تكون 8 أحرف على الأقل.");
    valid = false;
  }

  if (mode === "register" && confirmInput.value !== passwordInput.value) {
    showError(confirmInput, "confirm-error", "كلمتا المرور غير متطابقتين.");
    valid = false;
  }

  return valid;
}

loginTab.addEventListener("click", () => setMode("login"));
registerTab.addEventListener("click", () => setMode("register"));
switchModeButton.addEventListener("click", () => setMode(mode === "login" ? "register" : "login"));

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  message.textContent = "";
  message.className = "form-message";

  if (!validate()) {
    message.textContent = "راجع الحقول المحددة وحاول مرة ثانية.";
    message.classList.add("error");
    return;
  }

  if (!window.bbenSupabase) {
    message.textContent = "تعذر الاتصال بخدمة الحسابات. أعد تحميل الصفحة وحاول مجدداً.";
    message.classList.add("error");
    return;
  }

  submitButton.disabled = true;
  submitButton.textContent = mode === "register" ? "جارٍ إنشاء الحساب..." : "جارٍ تسجيل الدخول...";

  try {
    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (mode === "register") {
      const selectedRole = form.querySelector('input[name="role"]:checked').value;
      const { data, error } = await window.bbenSupabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: nameInput.value.trim(), role: selectedRole } }
      });
      if (error) throw error;

      if (data.session) {
        window.location.href = selectedRole === "merchant" ? "seller.html" : "market.html";
        return;
      }
      message.textContent = "تم إنشاء طلب الحساب. افحص بريدك الإلكتروني لتأكيد الحساب، ثم سجّل الدخول.";
      message.classList.add("success");
    } else {
      const { data, error } = await window.bbenSupabase.auth.signInWithPassword({ email, password });
      if (error) throw error;

      const { data: profile, error: profileError } = await window.bbenSupabase
        .from("profiles").select("role").eq("id", data.user.id).single();
      if (profileError) throw profileError;

      if (profile.role === "merchant") {
        window.location.href = "seller.html";
        return;
      }
      message.textContent = "تم تسجيل الدخول بنجاح. واجهة المشتري قيد التجهيز، ويمكنك العودة لاحقاً.";
      message.classList.add("success");
    }
  } catch (error) {
    const messages = {
      "Invalid login credentials": "البريد الإلكتروني أو كلمة المرور غير صحيحة.",
      "User already registered": "هذا البريد مسجل مسبقاً. جرّب تسجيل الدخول.",
      "Email not confirmed": "أكد بريدك الإلكتروني أولاً من الرسالة التي وصلتك."
    };
    message.textContent = messages[error.message] || ("تعذر إكمال العملية: " + error.message);
    message.classList.add("error");
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = mode === "register"
      ? 'إنشاء الحساب <span aria-hidden="true">←</span>'
      : 'تسجيل الدخول <span aria-hidden="true">←</span>';
  }
});

[emailInput, passwordInput, nameInput, confirmInput].forEach((input) => {
  input.addEventListener("input", () => {
    input.removeAttribute("aria-invalid");
    const error = input.parentElement.querySelector(".field-error");
    if (error) error.textContent = "";
  });
});