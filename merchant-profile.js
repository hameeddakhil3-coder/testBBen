const db = window.bbenSupabase;
let currentUser = null;
let currentProfile = null;
let currentStore = null;
let originalImageUrl = null;

const $ = (selector) => document.querySelector(selector);
const form = $("#merchant-profile-form");
const message = $("#profile-message");
const imageInput = $("#store-image");
const imagePreview = $("#store-image-preview");

function setMessage(text, type = "") {
  message.textContent = text;
  message.className = "profile-alert " + type;
}
function toast(text) {
  const el = $("#toast");
  el.textContent = text; el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2600);
}
function fillForm() {
  $("#merchant-name").value = currentProfile?.full_name || "";
  $("#merchant-phone").value = currentProfile?.phone || "";
  $("#store-name").value = currentStore?.name || "";
  $("#store-phone").value = currentStore?.phone || "";
  $("#store-city").value = currentStore?.city || "";
  $("#store-description").value = currentStore?.description || "";
  originalImageUrl = currentStore?.logo_url || null;
  if (originalImageUrl) imagePreview.src = originalImageUrl;
}
imageInput.addEventListener("change", () => {
  const file = imageInput.files?.[0];
  if (!file) { imagePreview.src = originalImageUrl || imagePreview.src; return; }
  if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) {
    imageInput.value = ""; toast("اختر صورة صالحة لا يتجاوز حجمها 5 ميغابايت."); return;
  }
  imagePreview.src = URL.createObjectURL(file);
});
async function uploadStoreImage(file) {
  if (!file) return originalImageUrl;
  if (!file.type.startsWith("image/") || file.size > 5 * 1024 * 1024) throw new Error("حجم الصورة يجب ألا يتجاوز 5 ميغابايت.");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = currentUser.id + "/stores/" + crypto.randomUUID() + "." + ext;
  const { error } = await db.storage.from("bben-images").upload(path, file, { upsert: false, contentType: file.type });
  if (error) throw error;
  return db.storage.from("bben-images").getPublicUrl(path).data.publicUrl;
}
$("#back-dashboard").addEventListener("click", () => { window.location.href = "seller.html"; });
$("#cancel-profile").addEventListener("click", () => { fillForm(); imageInput.value = ""; setMessage(""); });
$("#profile-logout").addEventListener("click", async () => {
  $("#profile-logout").disabled = true;
  if (db) await db.auth.signOut();
  window.location.href = "index.html";
});
form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!db || !currentUser || !currentProfile || !currentStore) { setMessage("تعذر الاتصال بالحساب أو المتجر. أعد تحميل الصفحة.", "error"); return; }
  const merchantName = $("#merchant-name").value.trim();
  const storeName = $("#store-name").value.trim();
  if (merchantName.length < 2 || storeName.length < 2) { setMessage("اكتب اسم التاجر واسم المتجر (حرفين على الأقل).", "error"); return; }
  const save = $("#save-profile"); save.disabled = true; setMessage("جارٍ حفظ التعديلات...");
  try {
    const logoUrl = await uploadStoreImage(imageInput.files?.[0]);
    const profileResult = await db.from("profiles").update({
      full_name: merchantName,
      phone: $("#merchant-phone").value.trim() || null
    }).eq("id", currentUser.id).select("id,full_name,phone,role").single();
    if (profileResult.error) throw profileResult.error;
    const storeResult = await db.from("stores").update({
      name: storeName,
      logo_url: logoUrl,
      phone: $("#store-phone").value.trim() || null,
      city: $("#store-city").value.trim() || null,
      description: $("#store-description").value.trim() || null
    }).eq("id", currentStore.id).eq("owner_id", currentUser.id)
      .select("id,owner_id,name,slug,description,logo_url,phone,city").single();
    if (storeResult.error) throw storeResult.error;
    currentProfile = profileResult.data; currentStore = storeResult.data; fillForm(); imageInput.value = "";
    setMessage("تم حفظ معلومات التاجر والمتجر بنجاح.", "success");
  } catch (error) {
    setMessage("تعذر حفظ التعديلات: " + (error.message || "خطأ غير معروف"), "error");
  } finally { save.disabled = false; }
});

async function initProfile() {
  if (!db) { window.location.href = "index.html"; return; }
  const { data, error } = await db.auth.getSession();
  currentUser = data?.session?.user;
  if (error || !currentUser) { window.location.href = "index.html"; return; }
  const profileResult = await db.from("profiles").select("id,full_name,phone,role").eq("id", currentUser.id).single();
  if (profileResult.error || profileResult.data?.role !== "merchant") { toast("هذه الصفحة مخصصة لحساب التاجر."); setTimeout(() => { window.location.href = "index.html"; }, 1400); return; }
  currentProfile = profileResult.data;
  const storeResult = await db.from("stores").select("id,owner_id,name,slug,description,logo_url,phone,city").eq("owner_id", currentUser.id).maybeSingle();
  if (storeResult.error || !storeResult.data) { setMessage("تعذر تحميل بيانات المتجر: " + (storeResult.error?.message || "لم يتم العثور على متجر."), "error"); return; }
  currentStore = storeResult.data; fillForm();
}
initProfile();