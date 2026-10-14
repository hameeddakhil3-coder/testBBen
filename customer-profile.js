const db = window.bbenSupabase;
const $ = (selector) => document.querySelector(selector);
let currentUser = null;
let currentProfile = null;
let loadingOrders = false;
function showMessage(text, type = "") {
  const el = $("#customer-profile-message");
  el.textContent = text;
  el.className = "customer-message " + type;
}

const statusLabels = {pending:"قيد الانتظار",processing:"قيد التجهيز",shipped:"قيد التوصيل",delivered:"مكتمل",cancelled:"ملغي"};
const money = value => new Intl.NumberFormat("ar-IQ").format(Number(value)||0) + " د.ع";
function orderText(parent, tag, cls, value) {
  const el = document.createElement(tag); el.className = cls || ""; el.textContent = value; parent.append(el); return el;
}
function renderOrders(orders) {
  const host = $("#customer-orders-list"); host.replaceChildren();
  $("#customer-orders-count").textContent = orders.length + " طلب";
  if (!orders.length) { orderText(host,"p","customer-empty","لا توجد طلبات حتى الآن. ستظهر مشترياتك هنا بعد إتمام أول طلب."); return; }
  orders.forEach(order => {
    const card = orderText(host,"article","customer-order","");
    const head = orderText(card,"div","customer-order-head","");
    const info = orderText(head,"div","","");
    orderText(info,"strong","customer-order-number","طلب رقم #" + (order.order_number ?? "—"));
    const date = new Date(order.created_at);
    orderText(info,"small","customer-order-date",Number.isNaN(date.getTime()) ? "التاريخ غير متاح" : new Intl.DateTimeFormat("ar-IQ",{dateStyle:"medium",timeStyle:"short"}).format(date));
    const status = orderText(head,"span","customer-order-status " + (order.status||""),statusLabels[order.status] || order.status || "غير محدد");
    const list = orderText(card,"ul","customer-order-items","");
    (order.order_items||[]).forEach(item => {
      const li = orderText(list,"li","customer-order-item","");
      orderText(li,"span","",(item.product_name||"منتج")+" × "+(item.quantity||1));
      orderText(li,"strong","",money(item.line_total == null ? Number(item.unit_price||0)*Number(item.quantity||1) : item.line_total));
    });
    orderText(card,"div","customer-order-address","عنوان التوصيل: "+(order.shipping_address||"غير مسجل في الطلب"));
    const totals = orderText(card,"div","customer-order-totals","");
    [["مجموع المنتجات",money(order.subtotal)],["أجرة التوصيل",money(order.delivery_fee)],["الإجمالي",money(order.total == null ? Number(order.subtotal||0)+Number(order.delivery_fee||0) : order.total)]].forEach((entry,i)=>{
      const row=orderText(totals,"div","customer-order-total"+(i===2?" grand":""),"");
      orderText(row,"span","",entry[0]); orderText(row,"strong","",entry[1]);
    });
  });
}
async function loadCustomerOrders() {
  if (!db || !currentUser || loadingOrders) return;
  loadingOrders=true;
  const button=$("#refresh-customer-orders"); button.disabled=true; button.textContent="جارٍ التحديث...";
  $("#customer-orders-message").textContent="";
  const host=$("#customer-orders-list"); host.replaceChildren(); orderText(host,"p","customer-empty","جارٍ تحميل طلباتك...");
  try {
    const {data,error}=await db.from("orders").select("id,order_number,status,subtotal,delivery_fee,total,shipping_address,created_at,order_items(id,product_name,unit_price,quantity,line_total)").eq("customer_id",currentUser.id).order("created_at",{ascending:false});
    if(error) throw error;
    renderOrders(data||[]);
  } catch(error) {
    host.replaceChildren(); orderText(host,"p","customer-empty","تعذر تحميل الطلبات. اضغط تحديث للمحاولة مرة أخرى.");
    $("#customer-orders-message").textContent=error.message||"تعذر تحميل الطلبات."; $("#customer-orders-message").className="customer-message error";
  } finally { loadingOrders=false; button.disabled=false; button.textContent="تحديث"; }
}

function fillForm() {
  $("#customer-name").value = currentProfile?.full_name || "";
  $("#customer-phone").value = currentProfile?.phone || "";
  $("#customer-address").value = currentProfile?.default_shipping_address || "";
  $("#customer-email").value = currentUser?.email || "";
}
$("#back-market").addEventListener("click", () => { window.location.href = "market.html"; });
$("#customer-orders").addEventListener("click", () => { $("#customer-orders-section").scrollIntoView({behavior:"smooth",block:"start"}); loadCustomerOrders(); });
$("#refresh-customer-orders").addEventListener("click", loadCustomerOrders);
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
  const defaultShippingAddress = $("#customer-address").value.trim();
  if (fullName.length < 2) { showMessage("اكتب الاسم الكامل (حرفين على الأقل).", "error"); $("#customer-name").focus(); return; }
  if (defaultShippingAddress.length > 500) { showMessage("عنوان التوصيل طويل جداً؛ اختصره إلى 500 حرف.", "error"); $("#customer-address").focus(); return; }
  const button = $("#save-customer-profile"); button.disabled = true; button.textContent = "جارٍ الحفظ..."; showMessage("");
  try {
    const { data, error } = await db.from("profiles").update({ full_name: fullName, phone: phone || null, default_shipping_address: defaultShippingAddress || null })
      .eq("id", currentUser.id).eq("role", "customer").select("id,full_name,phone,default_shipping_address,role").single();
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
    const result = await db.from("profiles").select("id,full_name,phone,default_shipping_address,role").eq("id", currentUser.id).single();
    if (result.error) throw result.error;
    if (result.data?.role !== "customer") {
      if (result.data?.role === "merchant") window.location.href = "seller.html";
      else if (result.data?.role === "admin") window.location.href = "platform/";
      else window.location.href = "index.html";
      return;
    }
    currentProfile = result.data; fillForm(); await loadCustomerOrders();
  } catch (error) { showMessage("تعذر تحميل معلومات الحساب: " + (error.message || "خطأ غير معروف"), "error"); }
}
initCustomerProfile();