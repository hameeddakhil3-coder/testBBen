const db = window.bbenSupabase;
const $ = (selector) => document.querySelector(selector);
let currentUser = null;
let currentProfile = null;
function showMessage(text, type = "") {
  const el = $("#customer-profile-message");
  el.textContent = text;
  el.className = "customer-message " + type;
}
function fillForm() {
  $("#customer-name").value = currentProfile?.full_name || "";
  $("#customer-phone").value = currentProfile?.phone || "";
  $("#customer-email").value = currentUser?.email || "";
}
$("#back-market").addEventListener("click", () => { window.location.href = "market.html"; });
$("#customer-orders").addEventListener("click", () => { window.location.href = "market.html"; });
$("#reset-customer-profile").addEventListener("click", () => { fillForm(); showMessage(""); });
$("#customer-logout").addEventListener("click", async () => {
  const button = $("#customer-logout"); button.disabled = true;
  try { if (db) await db.auth.signOut(); } finally { window.location.href = "index.html"; }
});
$("#customer-profile-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!db || !currentUser || !currentProfile) { showMessage("تعذر الاتصال بالحساب. أعد تحميل الصفحة وحاول مجدداً.", "error"); return; }
  const fullName = $("#customer-name").value.trim();
  const phone = $("#customer-phone").value.trim();
  if (fullName.length < 2) { showMessage("اكتب الاسم الكامل (حرفين على الأقل).", "error"); $("#customer-name").focus(); return; }
  const button = $("#save-customer-profile"); button.disabled = true; button.textContent = "جارٍ الحفظ..."; showMessage("");
  try {
    const { data, error } = await db.from("profiles").update({ full_name: fullName, phone: phone || null })
      .eq("id", currentUser.id).eq("role", "customer").select("id,full_name,phone,role").single();
    if (error) throw error;
    currentProfile = data; fillForm(); showMessage("تم حفظ معلومات حسابك بنجاح.", "success");
  } catch (error) {
    showMessage("تعذر حفظ التعديلات: " + (error.message || "خطأ غير معروف"), "error");
  } finally { button.disabled = false; button.textContent = "حفظ التعديلات"; }
});
async function initCustomerProfile() {
  if (!db) { window.location.href = "index.html"; return; }
  try {
    const { data, error } = await db.auth.getSession(); if (error) throw error;
    currentUser = data?.session?.user || null;
    if (!currentUser) { window.location.href = "index.html"; return; }
    const result = await db.from("profiles").select("id,full_name,phone,role").eq("id", currentUser.id).single();
    if (result.error) throw result.error;
    if (result.data?.role !== "customer") {
      if (result.data?.role === "merchant") window.location.href = "seller.html";
      else if (result.data?.role === "admin") window.location.href = "platform/";
      else window.location.href = "index.html";
      return;
    }
    currentProfile = result.data; fillForm();
  } catch (error) { showMessage("تعذر تحميل معلومات الحساب: " + (error.message || "خطأ غير معروف"), "error"); }
}
initCustomerProfile();